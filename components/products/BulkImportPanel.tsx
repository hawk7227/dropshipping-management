'use client';

// components/products/BulkImportPanel.tsx
// Bulk import products from CSV, JSON, Excel files to Shopify, eBay, TikTok, etc.

import React, { useState, useCallback } from 'react';
import { Card, Button, Spinner, Badge, Table, Tabs, Modal, FileUpload, Select, Alert, ProgressBar } from '@/components/ui';

interface ImportMapping {
  sourceField: string;
  targetField: string;
  transform?: string;
}

interface ImportPreview {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
  previewRows: number;
}

interface ImportJob {
  id: string;
  status: 'pending' | 'validating' | 'importing' | 'completed' | 'failed';
  totalProducts: number;
  processedProducts: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
  destination: string;
  createdAt: string;
  completedAt?: string;
}

interface FieldMapping {
  source: string;
  target: string;
  required: boolean;
  transform?: 'none' | 'lowercase' | 'uppercase' | 'number' | 'boolean' | 'array' | 'price';
}

const DESTINATION_CHANNELS = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'ebay', label: 'eBay' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'google', label: 'Google Merchant' },
  { value: 'all', label: 'All Channels' },
];

const REQUIRED_FIELDS = [
  { target: 'title', label: 'Product Title', required: true },
  { target: 'price', label: 'Price', required: true },
  { target: 'sku', label: 'SKU', required: true },
  { target: 'description', label: 'Description', required: false },
  { target: 'vendor', label: 'Vendor/Brand', required: false },
  { target: 'product_type', label: 'Product Type', required: false },
  { target: 'tags', label: 'Tags', required: false },
  { target: 'inventory_quantity', label: 'Inventory Quantity', required: false },
  { target: 'weight', label: 'Weight', required: false },
  { target: 'weight_unit', label: 'Weight Unit', required: false },
  { target: 'barcode', label: 'Barcode/UPC', required: false },
  { target: 'compare_at_price', label: 'Compare at Price', required: false },
  { target: 'cost', label: 'Cost per Item', required: false },
  { target: 'image_url', label: 'Main Image URL', required: false },
  { target: 'additional_images', label: 'Additional Images', required: false },
  { target: 'variant_options', label: 'Variant Options', required: false },
  { target: 'meta_title', label: 'SEO Title', required: false },
  { target: 'meta_description', label: 'SEO Description', required: false },
  { target: 'status', label: 'Status', required: false },
];

const TRANSFORMS = [
  { value: 'none', label: 'No Transform' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'number', label: 'Convert to Number' },
  { value: 'boolean', label: 'Convert to Boolean' },
  { value: 'array', label: 'Split to Array (comma)' },
  { value: 'price', label: 'Format as Price' },
];

export function BulkImportPanel() {
  const [activeTab, setActiveTab] = useState('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'csv' | 'json' | 'xlsx' | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [destination, setDestination] = useState('shopify');
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [importHistory, setImportHistory] = useState<ImportJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load import history on mount
  React.useEffect(() => {
    fetchImportHistory();
  }, []);

  async function fetchImportHistory() {
    try {
      const res = await fetch('/api/products?action=import-history&limit=20');
      if (res.ok) {
        const data = await res.json();
        setImportHistory(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch import history:', err);
    }
  }

  // Handle file upload
  const handleFileUpload = useCallback(async (files: File[]) => {
    const uploadedFile = files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setError(null);
    setValidationErrors([]);

    // Determine file type
    const ext = uploadedFile.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      setFileType('csv');
    } else if (ext === 'json') {
      setFileType('json');
    } else if (ext === 'xlsx' || ext === 'xls') {
      setFileType('xlsx');
    } else {
      setError('Unsupported file type. Please upload CSV, JSON, or Excel files.');
      return;
    }

    // Parse file for preview
    await parseFile(uploadedFile, ext as 'csv' | 'json' | 'xlsx');
  }, []);

  async function parseFile(file: File, type: 'csv' | 'json' | 'xlsx') {
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const res = await fetch('/api/products?action=parse-import-file', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to parse file');
      }

      const data = await res.json();
      setPreview(data.preview);
      
      // Auto-map fields based on header names
      autoMapFields(data.preview.headers);
      
      setActiveTab('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  }

  function autoMapFields(headers: string[]) {
    const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[_\s-]+/g, ''));
    const newMappings: FieldMapping[] = [];

    REQUIRED_FIELDS.forEach(field => {
      const normalizedTarget = field.target.toLowerCase().replace(/[_\s-]+/g, '');
      
      // Try to find a matching header
      const matchIndex = normalizedHeaders.findIndex(h => 
        h === normalizedTarget ||
        h.includes(normalizedTarget) ||
        normalizedTarget.includes(h) ||
        // Common aliases
        (normalizedTarget === 'title' && (h === 'name' || h === 'productname' || h === 'producttitle')) ||
        (normalizedTarget === 'price' && (h === 'cost' || h === 'amount' || h === 'saleprice')) ||
        (normalizedTarget === 'sku' && (h === 'itemid' || h === 'productid' || h === 'id')) ||
        (normalizedTarget === 'description' && (h === 'desc' || h === 'body' || h === 'content')) ||
        (normalizedTarget === 'inventoryquantity' && (h === 'stock' || h === 'qty' || h === 'quantity'))
      );

      if (matchIndex !== -1) {
        newMappings.push({
          source: headers[matchIndex],
          target: field.target,
          required: field.required,
          transform: field.target === 'price' || field.target === 'compare_at_price' || field.target === 'cost' 
            ? 'price' 
            : field.target === 'tags' || field.target === 'additional_images'
            ? 'array'
            : 'none',
        });
      } else if (field.required) {
        newMappings.push({
          source: '',
          target: field.target,
          required: true,
          transform: 'none',
        });
      }
    });

    setMappings(newMappings);
  }

  function updateMapping(index: number, updates: Partial<FieldMapping>) {
    setMappings(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }

  function addMapping() {
    setMappings(prev => [...prev, {
      source: '',
      target: '',
      required: false,
      transform: 'none',
    }]);
  }

  function removeMapping(index: number) {
    setMappings(prev => prev.filter((_, i) => i !== index));
  }

  function validateMappings(): boolean {
    const errors: string[] = [];
    
    // Check required fields have sources
    REQUIRED_FIELDS.filter(f => f.required).forEach(field => {
      const mapping = mappings.find(m => m.target === field.target);
      if (!mapping || !mapping.source) {
        errors.push(`Required field "${field.label}" is not mapped`);
      }
    });

    // Check for duplicate target mappings
    const targetCounts: Record<string, number> = {};
    mappings.forEach(m => {
      if (m.target) {
        targetCounts[m.target] = (targetCounts[m.target] || 0) + 1;
      }
    });
    Object.entries(targetCounts).forEach(([target, count]) => {
      if (count > 1) {
        errors.push(`Field "${target}" is mapped multiple times`);
      }
    });

    setValidationErrors(errors);
    return errors.length === 0;
  }

  async function startImport() {
    if (!validateMappings()) {
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file!);
      formData.append('fileType', fileType!);
      formData.append('destination', destination);
      formData.append('mappings', JSON.stringify(mappings));

      const res = await fetch('/api/products?action=start-bulk-import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to start import');
      }

      const data = await res.json();
      setImportJob(data.job);
      setActiveTab('progress');

      // Poll for progress
      pollImportProgress(data.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
    } finally {
      setLoading(false);
    }
  }

  async function pollImportProgress(jobId: string) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/products?action=import-status&jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setImportJob(data.job);

          if (data.job.status === 'importing' || data.job.status === 'validating') {
            setTimeout(poll, 1000);
          } else {
            fetchImportHistory();
          }
        }
      } catch (err) {
        console.error('Failed to poll import status:', err);
      }
    };

    poll();
  }

  function resetImport() {
    setFile(null);
    setFileType(null);
    setPreview(null);
    setMappings([]);
    setImportJob(null);
    setError(null);
    setValidationErrors([]);
    setActiveTab('upload');
  }

  async function downloadTemplate(format: 'csv' | 'xlsx') {
    try {
      const res = await fetch(`/api/products?action=download-template&format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `product-import-template.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download template:', err);
    }
  }

  async function downloadErrorReport(jobId: string) {
    try {
      const res = await fetch(`/api/products?action=download-error-report&jobId=${jobId}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `import-errors-${jobId}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download error report:', err);
    }
  }

  const tabs = [
    { id: 'upload', label: 'Upload File' },
    { id: 'mapping', label: 'Field Mapping' },
    { id: 'progress', label: 'Import Progress' },
    { id: 'history', label: 'Import History' },
  ];

  const historyColumns = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (item: ImportJob) => new Date(item.createdAt).toLocaleString(),
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (item: ImportJob) => (
        <Badge>{item.destination.toUpperCase()}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: ImportJob) => (
        <Badge 
          variant={
            item.status === 'completed' ? 'success' : 
            item.status === 'failed' ? 'error' : 
            'warning'
          }
        >
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'totalProducts',
      header: 'Products',
      render: (item: ImportJob) => item.totalProducts,
    },
    {
      key: 'success',
      header: 'Success',
      render: (item: ImportJob) => (
        <span className="text-green-600">{item.successCount}</span>
      ),
    },
    {
      key: 'errors',
      header: 'Errors',
      render: (item: ImportJob) => (
        <span className={item.errorCount > 0 ? 'text-red-600' : 'text-gray-400'}>
          {item.errorCount}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item: ImportJob) => (
        item.errorCount > 0 && (
          <button
            onClick={() => downloadErrorReport(item.id)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Download Errors
          </button>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <Alert type="error" message={error} onDismiss={() => setError(null)} />
      )}

      <Card 
        title="Bulk Product Import"
        subtitle="Import products from CSV, JSON, or Excel files"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadTemplate('csv')}>
              CSV Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadTemplate('xlsx')}>
              Excel Template
            </Button>
          </div>
        }
      >
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-6">
          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              <FileUpload
                onUpload={handleFileUpload}
                accept=".csv,.json,.xlsx,.xls"
                label="Upload Product File"
                description="Supports CSV, JSON, and Excel files up to 10MB"
                loading={parsing}
              />

              {file && !parsing && (
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB • {fileType?.toUpperCase()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={resetImport}>
                    Remove
                  </Button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Import Destination
                </label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full max-w-xs border rounded-md px-3 py-2"
                >
                  {DESTINATION_CHANNELS.map(ch => (
                    <option key={ch.value} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Mapping Tab */}
          {activeTab === 'mapping' && preview && (
            <div className="space-y-6">
              {/* Preview Section */}
              <div>
                <h4 className="font-medium mb-3">File Preview ({preview.previewRows} of {preview.totalRows} rows)</h4>
                <div className="overflow-x-auto max-h-48 border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium text-gray-600">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.rows.slice(0, 5).map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          {preview.headers.map((h, colIdx) => (
                            <td key={colIdx} className="px-3 py-2 truncate max-w-xs">
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <Alert 
                  type="error" 
                  title="Validation Errors"
                  message={validationErrors.join('. ')}
                />
              )}

              {/* Field Mappings */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Field Mappings</h4>
                  <Button variant="outline" size="sm" onClick={addMapping}>
                    Add Mapping
                  </Button>
                </div>

                <div className="space-y-3">
                  {mappings.map((mapping, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Source Column</label>
                        <select
                          value={mapping.source}
                          onChange={(e) => updateMapping(idx, { source: e.target.value })}
                          className={`w-full border rounded px-2 py-1.5 text-sm ${
                            mapping.required && !mapping.source ? 'border-red-300' : ''
                          }`}
                        >
                          <option value="">-- Select --</option>
                          {preview.headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>

                      <svg className="w-5 h-5 text-gray-400 mt-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>

                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">
                          Target Field
                          {mapping.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <select
                          value={mapping.target}
                          onChange={(e) => updateMapping(idx, { target: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">-- Select --</option>
                          {REQUIRED_FIELDS.map(f => (
                            <option key={f.target} value={f.target}>{f.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="w-40">
                        <label className="block text-xs text-gray-500 mb-1">Transform</label>
                        <select
                          value={mapping.transform}
                          onChange={(e) => updateMapping(idx, { transform: e.target.value as any })}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          {TRANSFORMS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>

                      {!mapping.required && (
                        <button
                          onClick={() => removeMapping(idx)}
                          className="mt-5 text-gray-400 hover:text-red-500"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setActiveTab('upload')}>
                  Back
                </Button>
                <Button onClick={startImport} loading={loading}>
                  Start Import to {destination.charAt(0).toUpperCase() + destination.slice(1)}
                </Button>
              </div>
            </div>
          )}

          {/* Progress Tab */}
          {activeTab === 'progress' && importJob && (
            <div className="space-y-6">
              <div className="text-center py-8">
                {importJob.status === 'importing' || importJob.status === 'validating' ? (
                  <>
                    <Spinner size="lg" />
                    <p className="mt-4 font-medium">
                      {importJob.status === 'validating' ? 'Validating data...' : 'Importing products...'}
                    </p>
                  </>
                ) : importJob.status === 'completed' ? (
                  <div className="text-green-600">
                    <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="mt-4 font-medium">Import Complete!</p>
                  </div>
                ) : (
                  <div className="text-red-600">
                    <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="mt-4 font-medium">Import Failed</p>
                  </div>
                )}
              </div>

              <ProgressBar
                value={importJob.processedProducts}
                max={importJob.totalProducts}
                label={`${importJob.processedProducts} of ${importJob.totalProducts} products`}
              />

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold">{importJob.totalProducts}</p>
                  <p className="text-sm text-gray-500">Total Products</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-semibold text-green-600">{importJob.successCount}</p>
                  <p className="text-sm text-gray-500">Successful</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-semibold text-red-600">{importJob.errorCount}</p>
                  <p className="text-sm text-gray-500">Failed</p>
                </div>
              </div>

              {/* Error List */}
              {importJob.errors && importJob.errors.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-red-600">Errors ({importJob.errors.length})</h4>
                    <button
                      onClick={() => downloadErrorReport(importJob.id)}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Download Full Report
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded divide-y">
                    {importJob.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="p-3 text-sm">
                        <span className="text-gray-500">Row {err.row}:</span>{' '}
                        <span className="font-medium">{err.field}</span> - {err.message}
                      </div>
                    ))}
                    {importJob.errors.length > 10 && (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        ... and {importJob.errors.length - 10} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {(importJob.status === 'completed' || importJob.status === 'failed') && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button onClick={resetImport}>
                    Import More Products
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <Table
              columns={historyColumns}
              data={importHistory}
              keyField="id"
              emptyMessage="No import history"
            />
          )}
        </div>
      </Card>
    </div>
  );
}
