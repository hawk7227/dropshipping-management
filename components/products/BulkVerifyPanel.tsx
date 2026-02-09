// components/products/BulkVerifyPanel.tsx
// Bulk verification panel - 4-step wizard with AI bot and export options
// Accessed from Products page via "Verify Supplier List" button

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  autoDetectColumns,
  parseProducts,
  verifyProducts,
  generateSummary,
  filterByStatus,
  exportToCsv,
  hasKeepaConfig,
  estimateCost,
  type ColumnMapping,
  type ParsedProduct,
  type VerifiedProduct,
  type VerificationSummary,
  type VerificationStatus,
  type CostEstimate,
} from '@/lib/bulk-verification';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface BulkVerifyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  existingAsins: Set<string>;
  onImportVerified?: (products: VerifiedProduct[]) => void;
}

type WizardStep = 'upload' | 'mapping' | 'verify' | 'results';

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function BulkVerifyPanel({
  isOpen,
  onClose,
  existingAsins,
  onImportVerified,
}: BulkVerifyPanelProps) {
  // State
  const [step, setStep] = useState<WizardStep>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    asin: null,
    title: null,
    price: null,
    vendor: null,
    category: null,
    sku: null,
    barcode: null,
  });
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [verifiedProducts, setVerifiedProducts] = useState<VerifiedProduct[]>([]);
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | 'all'>('all');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ processed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  
  // Options
  const [useKeepa, setUseKeepa] = useState(true);
  const [useRainforest, setUseRainforest] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('upload');
      setFileName('');
      setHeaders([]);
      setRawData([]);
      setMapping({
        asin: null, title: null, price: null, vendor: null,
        category: null, sku: null, barcode: null,
      });
      setParsedProducts([]);
      setVerifiedProducts([]);
      setSummary(null);
      setStatusFilter('all');
      setError(null);
      setCostEstimate(null);
    }
  }, [isOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // FILE UPLOAD HANDLER
  // ─────────────────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet);

      if (jsonData.length === 0) {
        setError('No data found in file');
        return;
      }

      // Get headers from first row
      const fileHeaders = Object.keys(jsonData[0]);
      setHeaders(fileHeaders);
      setRawData(jsonData);

      // Auto-detect column mappings
      const detected = autoDetectColumns(fileHeaders);
      setMapping(detected);

      // Generate cost estimate
      const estimate = estimateCost(jsonData.length, { useKeepa, useRainforest });
      setCostEstimate(estimate);

      setStep('mapping');
    } catch (err) {
      console.error('[BulkVerify] File parse error:', err);
      setError('Failed to parse file. Please ensure it is a valid Excel or CSV file.');
    }
  }, [useKeepa, useRainforest]);

  // ─────────────────────────────────────────────────────────────────────────
  // MAPPING HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleMappingChange = useCallback((field: keyof ColumnMapping, value: string | null) => {
    setMapping(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleMappingConfirm = useCallback(() => {
    if (!mapping.asin) {
      setError('ASIN column is required');
      return;
    }

    setError(null);
    const parsed = parseProducts(rawData, mapping);
    
    if (parsed.length === 0) {
      setError('No valid ASINs found in the selected column');
      return;
    }

    setParsedProducts(parsed);
    
    // Update cost estimate with actual product count
    const estimate = estimateCost(parsed.length, { useKeepa, useRainforest });
    setCostEstimate(estimate);

    setStep('verify');
  }, [mapping, rawData, useKeepa, useRainforest]);

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICATION HANDLER
  // ─────────────────────────────────────────────────────────────────────────

  const handleStartVerify = useCallback(async () => {
    setIsVerifying(true);
    setError(null);
    setVerifyProgress({ processed: 0, total: parsedProducts.length });

    try {
      const results = await verifyProducts(parsedProducts, existingAsins, {
        useKeepa,
        onProgress: (processed, total) => {
          setVerifyProgress({ processed, total });
        },
      });

      setVerifiedProducts(results);
      setSummary(generateSummary(results));
      setStep('results');
    } catch (err) {
      console.error('[BulkVerify] Verification error:', err);
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }, [parsedProducts, existingAsins, useKeepa]);

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleExportCsv = useCallback(() => {
    const filtered = filterByStatus(verifiedProducts, statusFilter);
    const csv = exportToCsv(filtered);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bulk-verify-${statusFilter}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [verifiedProducts, statusFilter]);

  const handleImportPassed = useCallback(() => {
    const passed = verifiedProducts.filter(p => p.status === 'pass' || p.status === 'warning');
    if (onImportVerified) {
      onImportVerified(passed);
    }
    onClose();
  }, [verifiedProducts, onImportVerified, onClose]);

  // ─────────────────────────────────────────────────────────────────────────
  // FILTERED RESULTS
  // ─────────────────────────────────────────────────────────────────────────

  const filteredResults = filterByStatus(verifiedProducts, statusFilter);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-purple-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Verify Supplier List</h2>
            <p className="text-purple-200 text-sm">
              {step === 'upload' && 'Step 1: Upload your ASIN list'}
              {step === 'mapping' && 'Step 2: Map columns'}
              {step === 'verify' && 'Step 3: Review & verify'}
              {step === 'results' && 'Step 4: Results'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-purple-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-2 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            {(['upload', 'mapping', 'verify', 'results'] as WizardStep[]).map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step === s ? 'bg-purple-600 text-white' :
                    ['upload', 'mapping', 'verify', 'results'].indexOf(step) > i ?
                    'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {i + 1}
                </div>
                {i < 3 && (
                  <div className={`w-12 h-1 mx-1 ${
                    ['upload', 'mapping', 'verify', 'results'].indexOf(step) > i ?
                    'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* AI Bot Recommendation */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white">
                    🤖
                  </div>
                  <div>
                    <h3 className="font-semibold text-purple-900">AI Recommendation Bot</h3>
                    <p className="text-purple-700 text-sm mt-1">
                      Upload your ASIN list and I'll recommend the most cost-effective verification strategy.
                      I'll use Keepa for initial filtering (free with your plan), then enrich only winners
                      with Rainforest data to save you money!
                    </p>
                    {!hasKeepaConfig() && (
                      <p className="text-orange-600 text-sm mt-2 flex items-center gap-1">
                        ⚠️ Keepa API key not configured. Verification will use limited data.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-colors"
              >
                <div className="text-4xl mb-4">📁</div>
                <p className="text-gray-600 font-medium">Drop your Excel or CSV file here</p>
                <p className="text-gray-400 text-sm mt-1">or click to browse</p>
                <p className="text-gray-400 text-xs mt-4">Supports .xlsx, .xls, .csv files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Options */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium mb-3">Verification Options</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useKeepa}
                      onChange={e => setUseKeepa(e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm">Use Keepa for price/rating/reviews (1 token/ASIN)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useRainforest}
                      onChange={e => setUseRainforest(e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm">Use Rainforest for full product details (~$0.02/product, winners only)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 'mapping' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800">
                  <strong>File loaded:</strong> {fileName} • {rawData.length.toLocaleString()} rows • {headers.length} columns
                </p>
              </div>

              {/* AI Cost Estimate */}
              {costEstimate && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white">
                      🤖
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-purple-900">AI Strategy Recommendation</h3>
                      <p className="text-purple-700 text-sm mt-1">{costEstimate.strategy}</p>
                      <div className="grid grid-cols-4 gap-4 mt-3 text-sm">
                        <div>
                          <span className="text-purple-500">Keepa Tokens</span>
                          <p className="font-semibold">{costEstimate.keepaTokens.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-purple-500">Rainforest Cost</span>
                          <p className="font-semibold">${costEstimate.rainforestCost.toFixed(2)}</p>
                        </div>
                        <div>
                          <span className="text-purple-500">Processing Time</span>
                          <p className="font-semibold">{costEstimate.processingTime}</p>
                        </div>
                        <div>
                          <span className="text-purple-500">Savings</span>
                          <p className="font-semibold text-green-600">${costEstimate.savings.toFixed(2)} ({costEstimate.savingsPercent}%)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Column Mapping */}
              <div>
                <h3 className="font-semibold mb-4">Map Your Columns</h3>
                <div className="grid grid-cols-2 gap-4">
                  {(Object.keys(mapping) as Array<keyof ColumnMapping>).map(field => (
                    <div key={field} className="flex items-center gap-3">
                      <label className="w-24 text-sm font-medium text-gray-700 capitalize">
                        {field === 'asin' ? 'ASIN *' : field}
                      </label>
                      <select
                        value={mapping[field] || ''}
                        onChange={e => handleMappingChange(field, e.target.value || null)}
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm ${
                          field === 'asin' && !mapping.asin ? 'border-red-300 bg-red-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">-- Select column --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <h3 className="font-semibold mb-2">Preview (first 5 rows)</h3>
                <div className="border rounded-lg overflow-auto max-h-48">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Row</th>
                        <th className="px-3 py-2 text-left">ASIN</th>
                        <th className="px-3 py-2 text-left">Title</th>
                        <th className="px-3 py-2 text-left">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {mapping.asin ? row[mapping.asin] : '-'}
                          </td>
                          <td className="px-3 py-2 truncate max-w-xs">
                            {mapping.title ? row[mapping.title] : '-'}
                          </td>
                          <td className="px-3 py-2">
                            {mapping.price ? row[mapping.price] : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  ← Back
                </button>
                <button
                  onClick={handleMappingConfirm}
                  disabled={!mapping.asin}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Verify */}
          {step === 'verify' && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800">
                  <strong>Ready to verify:</strong> {parsedProducts.length.toLocaleString()} valid ASINs found
                </p>
              </div>

              {/* AI Summary */}
              {costEstimate && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white">
                      🤖
                    </div>
                    <div>
                      <h3 className="font-semibold text-purple-900">Verification Summary</h3>
                      <p className="text-purple-700 text-sm mt-1">{costEstimate.strategy}</p>
                      <p className="text-purple-600 text-sm mt-1">
                        Estimated time: {costEstimate.processingTime}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Verification Progress */}
              {isVerifying && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Verifying products...</span>
                    <span className="text-sm text-gray-500">
                      {verifyProgress.processed.toLocaleString()} / {verifyProgress.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${(verifyProgress.processed / verifyProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Using Keepa API for verification. Please wait...
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep('mapping')}
                  disabled={isVerifying}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleStartVerify}
                  disabled={isVerifying}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Start Verification
                      <span className="text-purple-200">→</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {step === 'results' && summary && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{summary.total.toLocaleString()}</p>
                  <p className="text-sm text-blue-700">Total</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{summary.passed.toLocaleString()}</p>
                  <p className="text-sm text-green-700">Passed</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{summary.warnings.toLocaleString()}</p>
                  <p className="text-sm text-yellow-700">Warnings</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{summary.failed.toLocaleString()}</p>
                  <p className="text-sm text-red-700">Failed</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-purple-600">{summary.passRate}%</p>
                  <p className="text-sm text-purple-700">Pass Rate</p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 border-b pb-2">
                {(['all', 'pass', 'warning', 'fail'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                      statusFilter === status
                        ? 'bg-purple-100 text-purple-700 border-b-2 border-purple-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                    {status !== 'all' && (
                      <span className="ml-1 text-xs">
                        ({status === 'pass' ? summary.passed : status === 'warning' ? summary.warnings : summary.failed})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Results Table */}
              <div className="border rounded-lg overflow-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">ASIN</th>
                      <th className="px-3 py-2 text-left">Title</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Rating</th>
                      <th className="px-3 py-2 text-right">Reviews</th>
                      <th className="px-3 py-2 text-left">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.slice(0, 100).map((product, i) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            product.status === 'pass' ? 'bg-green-500' :
                            product.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                          }`} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{product.asin}</td>
                        <td className="px-3 py-2 truncate max-w-xs">{product.title || '-'}</td>
                        <td className="px-3 py-2 text-right">
                          {product.amazonPrice ? `$${product.amazonPrice.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {product.rating ? product.rating.toFixed(1) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {product.reviewCount?.toLocaleString() || '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-xs">
                          {[...product.failReasons, ...product.warningReasons].join('; ') || '✓'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredResults.length > 100 && (
                  <div className="p-2 bg-gray-50 text-center text-sm text-gray-500">
                    Showing 100 of {filteredResults.length.toLocaleString()} results. Export to see all.
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-between pt-4">
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCsv}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span>📥</span>
                    Export CSV
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleImportPassed}
                    disabled={summary.passed + summary.warnings === 0}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    Import {(summary.passed + summary.warnings).toLocaleString()} Products
                    <span>→</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BulkVerifyPanel;
