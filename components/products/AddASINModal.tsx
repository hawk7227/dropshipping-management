'use client';

import React, { useState } from 'react';
import { Button, Input, Modal, ErrorAlert, Alert } from '@/components/ui';

interface AddASINModalProps {
  isOpen: boolean;
  productId: string;
  productTitle: string;
  currentASIN?: string;
  onClose: () => void;
  onSave: (asin: string, url: string) => Promise<void>;
}

export function AddASINModal({
  isOpen,
  productId,
  productTitle,
  currentASIN = '',
  onClose,
  onSave,
}: AddASINModalProps) {
  const [amazonUrl, setAmazonUrl] = useState('');
  const [asin, setAsin] = useState(currentASIN);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const extractASIN = (url: string) => {
    // Match ASIN from Amazon URL: /dp/B0XXXXX or /gp/product/B0XXXXX
    const match = url.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/);
    if (match && match[1]) {
      setAsin(match[1]);
      setError(null);
      return match[1];
    }
    return '';
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setAmazonUrl(url);
    if (url.length > 10) {
      extractASIN(url);
    }
  };

  const handleASINChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setAsin(value);
    if (value.length === 10) {
      setError(null);
    }
  };

  const validateASIN = (code: string): boolean => {
    // ASIN is 10 alphanumeric characters starting with B
    return /^B[A-Z0-9]{9}$/.test(code);
  };

  const handleSave = async () => {
    if (!asin) {
      setError('Please enter an ASIN');
      return;
    }

    if (!validateASIN(asin)) {
      setError('Invalid ASIN format (should be 10 characters starting with B)');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(asin, amazonUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ASIN');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setAmazonUrl('');
    setAsin(currentASIN);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      onClose={handleClose}
      title={`Add Amazon ASIN for "${productTitle}"`}
    >
      <div className="space-y-4">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {currentASIN && (
          <Alert type="info" message={`Current ASIN: ${currentASIN}`} />
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amazon Product URL
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Paste the full Amazon URL or just the ASIN code below
          </p>
          <Input
            type="text"
            value={amazonUrl}
            onChange={handleUrlChange}
            placeholder="https://www.amazon.com/Product-Name/dp/B0XXXXX"
            className="w-full"
          />
          <p className="text-xs text-gray-400 mt-1">
            Example: https://amazon.com/Apple-AirPods-Charging-Latest-Model/dp/B0935D2JQC
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">OR</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ASIN Code *
          </label>
          <Input
            type="text"
            value={asin}
            onChange={handleASINChange}
            placeholder="B0XXXXX (10 characters)"
            maxLength={10}
            className="w-full font-mono text-center text-lg tracking-widest"
          />
          <p className="text-xs text-gray-400 mt-1">
            Format: 10 characters starting with B (e.g., B0935D2JQC)
          </p>
        </div>

        {asin && validateASIN(asin) && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              ✅ Valid ASIN: <code className="font-bold">{asin}</code>
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!asin || !validateASIN(asin) || saving}
          >
            {saving ? 'Saving...' : 'Save ASIN'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Bulk ASIN Upload Component
 * For importing multiple ASINs at once
 */
interface BulkASINUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (updates: Array<{ productId: string; asin: string; competitor_link?: string }>) => Promise<void>;
}

export function BulkASINUploadModal({
  isOpen,
  onClose,
  onUpload,
}: BulkASINUploadProps) {
  const [csvContent, setCsvContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Array<{ productId: string; asin: string; competitor_link?: string }> | null>(null);

  const parseCSV = (content: string) => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      setError('CSV must have at least a header and one data row');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const productIdIdx = headers.indexOf('product_id');
    const asinIdx = headers.indexOf('asin');
    const linkIdx = headers.indexOf('competitor_link');

    if (productIdIdx === -1 || asinIdx === -1) {
      setError('CSV must have "product_id" and "asin" columns');
      return;
    }

    const rows: Array<{ productId: string; asin: string; competitor_link?: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length > Math.max(productIdIdx, asinIdx)) {
        rows.push({
          productId: parts[productIdIdx],
          asin: parts[asinIdx].toUpperCase(),
          competitor_link: linkIdx >= 0 ? parts[linkIdx] : undefined,
        });
      }
    }

    if (rows.length === 0) {
      setError('No valid rows found in CSV');
      return;
    }

    setError(null);
    setPreview(rows);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      parseCSV(content);
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!preview || preview.length === 0) {
      setError('No data to upload');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      await onUpload(preview);
      setCsvContent('');
      setPreview(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload ASINs');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      title="Bulk Import ASINs"
    >
      <div className="space-y-4">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-2">
            CSV format: product_id, asin, competitor_link (optional)
          </p>
        </div>

        {preview && (
          <div>
            <h3 className="text-sm font-medium mb-2">
              Preview ({preview.length} products)
            </h3>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-1 text-left">Product ID</th>
                    <th className="px-2 py-1 text-left">ASIN</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-2 py-1 text-xs">{row.productId}</td>
                      <td className="px-2 py-1 text-xs font-mono">{row.asin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 10 && (
                <p className="text-xs text-gray-500 mt-2">
                  ... and {preview.length - 10} more
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!preview || uploading}
          >
            {uploading ? 'Uploading...' : `Upload ${preview?.length || 0} Products`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
