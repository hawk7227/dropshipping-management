'use client';

/**
 * /converter — Shopify → eBay File Converter
 *
 * Upload a Shopify / Matrixify product export and convert it into
 * an eBay Seller Hub Reports CSV ready for bulk upload.
 */

import React, { useState, useCallback, useRef } from 'react';

// ── Types ───────────────────────────────────────────────────────────

interface ConversionSettings {
  defaultQuantity: number;
  conditionId: string;
  format: 'FixedPrice' | 'Auction';
  duration: string;
  location: string;
  shippingProfileName: string;
  returnProfileName: string;
  paymentProfileName: string;
  bestOfferEnabled: boolean;
  priceSource: 'variantPrice' | 'compareAtPrice';
  priceMarkupPercent: number;
}

interface ConversionStats {
  totalProducts: number;
  converted: number;
  skippedNoSku: number;
  skippedNoTitle: number;
}

interface PreviewRow {
  sku: string;
  title: string;
  price: string;
  quantity: string;
  images: number;
  barcode: string;
  category: string;
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: ConversionSettings = {
  defaultQuantity: 1,
  conditionId: '1000',
  format: 'FixedPrice',
  duration: 'GTC',
  location: '',
  shippingProfileName: '',
  returnProfileName: '',
  paymentProfileName: '',
  bestOfferEnabled: false,
  priceSource: 'variantPrice',
  priceMarkupPercent: 0,
};

// ── Component ───────────────────────────────────────────────────────

export default function ConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS);
  const [converting, setConverting] = useState(false);
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [csvBlob, setCsvBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ─────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.csv'))) {
      setFile(f);
      setError(null);
      setStats(null);
      setPreview([]);
      setCsvBlob(null);
    } else {
      setError('Please upload an .xlsx or .csv file');
    }
  }, []);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
      setStats(null);
      setPreview([]);
      setCsvBlob(null);
    }
  };

  // ── Convert ───────────────────────────────────────────────────────

  const handleConvert = async () => {
    if (!file) return;
    setConverting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('settings', JSON.stringify(settings));

      const res = await fetch('/api/converter', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Conversion failed');
      }

      // Read stats from headers
      setStats({
        totalProducts: Number(res.headers.get('X-Total-Products') ?? 0),
        converted: Number(res.headers.get('X-Converted') ?? 0),
        skippedNoSku: Number(res.headers.get('X-Skipped-No-SKU') ?? 0),
        skippedNoTitle: Number(res.headers.get('X-Skipped-No-Title') ?? 0),
      });

      // Get CSV text for preview + download
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv' });
      setCsvBlob(blob);

      // Build preview from first 20 data rows
      const lines = csvText.split('\n');
      const headers = lines[0].split(',');
      const skuIdx = headers.indexOf('Custom label (SKU)');
      const titleIdx = headers.indexOf('Title');
      const priceIdx = headers.indexOf('Start price');
      const qtyIdx = headers.indexOf('Quantity');
      const imgIdx = headers.indexOf('Item photo URL');
      const barcodeIdx = headers.indexOf('P:EPID');
      const categoryIdx = headers.indexOf('Category name');

      const previewRows: PreviewRow[] = [];
      for (let i = 1; i < Math.min(lines.length, 21); i++) {
        if (!lines[i].trim()) continue;
        // Simple split — good enough for preview since our values are
        // either clean or wrapped in quotes that we strip
        const cols = parseCsvLine(lines[i]);
        previewRows.push({
          sku: cols[skuIdx] ?? '',
          title: cols[titleIdx] ?? '',
          price: cols[priceIdx] ?? '',
          quantity: cols[qtyIdx] ?? '',
          images: (cols[imgIdx] ?? '').split('|').filter(Boolean).length,
          barcode: cols[barcodeIdx] ?? '',
          category: cols[categoryIdx] ?? '',
        });
      }
      setPreview(previewRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setConverting(false);
    }
  };

  // ── Download ──────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!csvBlob) return;
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ebay-upload-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Setting updater ───────────────────────────────────────────────

  const updateSetting = <K extends keyof ConversionSettings>(
    key: K,
    value: ConversionSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Shopify → eBay Converter
        </h1>
        <p className="text-gray-500 mt-1">
          Convert your Shopify / Matrixify product export into eBay Seller Hub
          Reports format
        </p>
      </div>

      {/* Upload area */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
          transition-colors duration-200
          ${file
            ? 'border-green-400 bg-green-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={onFileSelect}
          className="hidden"
        />
        {file ? (
          <div>
            <svg className="w-10 h-10 mx-auto text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-green-700 font-medium">{file.name}</p>
            <p className="text-green-600 text-sm mt-1">
              {(file.size / 1024 / 1024).toFixed(1)} MB — Click or drop to replace
            </p>
          </div>
        ) : (
          <div>
            <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 font-medium">
              Drop your Shopify export here, or click to browse
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Supports .xlsx and .csv files
            </p>
          </div>
        )}
      </div>

      {/* Settings toggle */}
      <div className="mt-6">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <svg
            className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Conversion Settings
        </button>

        {showSettings && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-white border border-gray-200 rounded-xl">
            {/* Pricing */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Price source
              </label>
              <select
                value={settings.priceSource}
                onChange={(e) =>
                  updateSetting('priceSource', e.target.value as ConversionSettings['priceSource'])
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="variantPrice">Variant Price (selling price)</option>
                <option value="compareAtPrice">Compare At Price (original)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Price markup %
              </label>
              <input
                type="number"
                value={settings.priceMarkupPercent}
                onChange={(e) => updateSetting('priceMarkupPercent', Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Default quantity
              </label>
              <input
                type="number"
                min={1}
                value={settings.defaultQuantity}
                onChange={(e) => updateSetting('defaultQuantity', Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Listing settings */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Condition
              </label>
              <select
                value={settings.conditionId}
                onChange={(e) => updateSetting('conditionId', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="1000">New</option>
                <option value="1500">New other</option>
                <option value="2000">Refurbished - Certified</option>
                <option value="2500">Refurbished - Seller</option>
                <option value="3000">Used</option>
                <option value="7000">For parts / not working</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Format
              </label>
              <select
                value={settings.format}
                onChange={(e) =>
                  updateSetting('format', e.target.value as ConversionSettings['format'])
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="FixedPrice">Fixed Price</option>
                <option value="Auction">Auction</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Duration
              </label>
              <select
                value={settings.duration}
                onChange={(e) => updateSetting('duration', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="GTC">Good &apos;Til Cancelled</option>
                <option value="3">3 Days</option>
                <option value="5">5 Days</option>
                <option value="7">7 Days</option>
                <option value="10">10 Days</option>
                <option value="30">30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Location
              </label>
              <input
                type="text"
                value={settings.location}
                onChange={(e) => updateSetting('location', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Tempe, AZ"
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="bestOffer"
                checked={settings.bestOfferEnabled}
                onChange={(e) => updateSetting('bestOfferEnabled', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="bestOffer" className="text-sm text-gray-700">
                Enable Best Offer
              </label>
            </div>

            {/* Business policies */}
            <div className="col-span-full border-t border-gray-100 pt-4 mt-2">
              <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                Business Policy Names (optional)
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Shipping profile
              </label>
              <input
                type="text"
                value={settings.shippingProfileName}
                onChange={(e) => updateSetting('shippingProfileName', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Free Standard Shipping"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Return profile
              </label>
              <input
                type="text"
                value={settings.returnProfileName}
                onChange={(e) => updateSetting('returnProfileName', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. 30 Day Returns"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Payment profile
              </label>
              <input
                type="text"
                value={settings.paymentProfileName}
                onChange={(e) => updateSetting('paymentProfileName', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. eBay Managed Payments"
              />
            </div>
          </div>
        )}
      </div>

      {/* Convert button */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={handleConvert}
          disabled={!file || converting}
          className={`
            px-6 py-3 rounded-xl font-medium text-sm transition-all
            ${!file || converting
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
            }
          `}
        >
          {converting ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Converting…
            </span>
          ) : (
            'Convert to eBay Format'
          )}
        </button>

        {csvBlob && (
          <button
            onClick={handleDownload}
            className="px-6 py-3 rounded-xl font-medium text-sm bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow transition-all"
          >
            Download eBay CSV
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Products" value={stats.totalProducts} color="blue" />
          <StatCard label="Converted" value={stats.converted} color="green" />
          <StatCard label="Skipped (no SKU)" value={stats.skippedNoSku} color="yellow" />
          <StatCard label="Skipped (no title)" value={stats.skippedNoTitle} color="yellow" />
        </div>
      )}

      {/* Preview table */}
      {preview.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            Preview (first 20 rows)
          </h2>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Images</th>
                  <th className="px-4 py-3">UPC / EAN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-600">
                      {row.sku}
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate" title={row.title}>
                      {row.title}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[180px] truncate" title={row.category}>
                      {row.category || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      ${row.price}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.images}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {row.barcode || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Column mapping reference */}
      {stats && (
        <div className="mt-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Column Mapping Reference
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-500">
            <MappingRow from="Tags (most specific tag)" to="Category name" />
            <MappingRow from="Variant SKU" to="Custom label (SKU)" />
            <MappingRow from="Title" to="Title (truncated to 80 chars)" />
            <MappingRow from="Variant Price / Compare At Price" to="Start price" />
            <MappingRow from="Total Inventory Qty" to="Quantity" />
            <MappingRow from="Image Src (all rows, pipe-joined)" to="Item photo URL" />
            <MappingRow from="Body HTML" to="Description" />
            <MappingRow from="Vendor" to="Manufacturer Name" />
            <MappingRow from="Variant Barcode" to="P:EPID + C:Type" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow';
}) {
  const styles = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  };

  return (
    <div className={`border rounded-xl p-4 ${styles[color]}`}>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs mt-1 opacity-70">{label}</p>
    </div>
  );
}

function MappingRow({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
        {from}
      </span>
      <span>→</span>
      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
        {to}
      </span>
    </div>
  );
}

// ── CSV line parser (handles quoted fields) ─────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
