'use client';

import React, { useState, useCallback, useRef } from 'react';

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

export default function ConverterPage() {
  const [productFile, setProductFile] = useState<File | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS);
  const [converting, setConverting] = useState(false);
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const onProductDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.csv'))) {
      setProductFile(f);
      setError(null);
      setStats(null);
      setDownloadBlob(null);
    } else {
      setError('Please upload an .xlsx or .csv product file');
    }
  }, []);

  const onProductSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setProductFile(f); setError(null); setStats(null); setDownloadBlob(null); }
  };

  const onTemplateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.name.endsWith('.xlsx')) {
      setTemplateFile(f);
      setError(null);
    } else if (f) {
      setError('eBay template must be an .xlsx file');
    }
  };

  const handleConvert = async () => {
    if (!productFile || !templateFile) return;
    setConverting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', productFile);
      formData.append('template', templateFile);
      formData.append('settings', JSON.stringify(settings));

      const res = await fetch('/api/converter', { method: 'POST', body: formData });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Conversion failed');
      }

      setStats({
        totalProducts: Number(res.headers.get('X-Total-Products') ?? 0),
        converted: Number(res.headers.get('X-Converted') ?? 0),
        skippedNoSku: Number(res.headers.get('X-Skipped-No-SKU') ?? 0),
        skippedNoTitle: Number(res.headers.get('X-Skipped-No-Title') ?? 0),
      });

      const blob = await res.blob();
      setDownloadBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!downloadBlob) return;
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ebay-upload-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateSetting = <K extends keyof ConversionSettings>(key: K, value: ConversionSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Shopify → eBay Converter</h1>
        <p className="text-gray-500 mt-1">
          Convert your Shopify product export into a filled-in eBay Seller Hub template
        </p>
      </div>

      {/* Two upload zones side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Product file upload */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onProductDrop}
          onClick={() => productInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-200 ${
            productFile ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <input ref={productInputRef} type="file" accept=".xlsx,.csv" onChange={onProductSelect} className="hidden" />
          {productFile ? (
            <div>
              <svg className="w-8 h-8 mx-auto text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-green-700 font-medium text-sm">{productFile.name}</p>
              <p className="text-green-600 text-xs mt-1">{(productFile.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          ) : (
            <div>
              <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 font-medium text-sm">Shopify Product Export</p>
              <p className="text-gray-400 text-xs mt-1">.xlsx or .csv</p>
            </div>
          )}
        </div>

        {/* eBay template upload */}
        <div
          onClick={() => templateInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-200 ${
            templateFile ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-orange-400 hover:bg-orange-50'
          }`}
        >
          <input ref={templateInputRef} type="file" accept=".xlsx" onChange={onTemplateSelect} className="hidden" />
          {templateFile ? (
            <div>
              <svg className="w-8 h-8 mx-auto text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-green-700 font-medium text-sm">{templateFile.name}</p>
              <p className="text-green-600 text-xs mt-1">{(templateFile.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          ) : (
            <div>
              <svg className="w-8 h-8 mx-auto text-orange-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600 font-medium text-sm">eBay Category Template</p>
              <p className="text-gray-400 text-xs mt-1">Download from Seller Hub → upload here</p>
            </div>
          )}
        </div>
      </div>

      {/* Settings toggle */}
      <div className="mt-6">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <svg className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Conversion Settings
        </button>

        {showSettings && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-white border border-gray-200 rounded-xl">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Price source</label>
              <select value={settings.priceSource} onChange={(e) => updateSetting('priceSource', e.target.value as ConversionSettings['priceSource'])} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="variantPrice">Variant Price (selling price)</option>
                <option value="compareAtPrice">Compare At Price (original)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Price markup %</label>
              <input type="number" value={settings.priceMarkupPercent} onChange={(e) => updateSetting('priceMarkupPercent', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Default quantity</label>
              <input type="number" min={1} value={settings.defaultQuantity} onChange={(e) => updateSetting('defaultQuantity', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Condition</label>
              <select value={settings.conditionId} onChange={(e) => updateSetting('conditionId', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="1000">New</option>
                <option value="1500">New other</option>
                <option value="2000">Refurbished - Certified</option>
                <option value="2500">Refurbished - Seller</option>
                <option value="3000">Used</option>
                <option value="7000">For parts / not working</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Format</label>
              <select value={settings.format} onChange={(e) => updateSetting('format', e.target.value as ConversionSettings['format'])} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="FixedPrice">Fixed Price</option>
                <option value="Auction">Auction</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
              <select value={settings.duration} onChange={(e) => updateSetting('duration', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="GTC">Good &apos;Til Cancelled</option>
                <option value="3">3 Days</option>
                <option value="5">5 Days</option>
                <option value="7">7 Days</option>
                <option value="10">10 Days</option>
                <option value="30">30 Days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
              <input type="text" value={settings.location} onChange={(e) => updateSetting('location', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Tempe, AZ" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="bestOffer" checked={settings.bestOfferEnabled} onChange={(e) => updateSetting('bestOfferEnabled', e.target.checked)} className="rounded border-gray-300" />
              <label htmlFor="bestOffer" className="text-sm text-gray-700">Enable Best Offer</label>
            </div>

            <div className="col-span-full border-t border-gray-100 pt-4 mt-2">
              <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">Business Policy Names (optional)</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Shipping profile</label>
              <input type="text" value={settings.shippingProfileName} onChange={(e) => updateSetting('shippingProfileName', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Free Standard Shipping" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Return profile</label>
              <input type="text" value={settings.returnProfileName} onChange={(e) => updateSetting('returnProfileName', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 30 Day Returns" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment profile</label>
              <input type="text" value={settings.paymentProfileName} onChange={(e) => updateSetting('paymentProfileName', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. eBay Managed Payments" />
            </div>
          </div>
        )}
      </div>

      {/* Convert + Download */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={handleConvert}
          disabled={!productFile || !templateFile || converting}
          className={`px-6 py-3 rounded-xl font-medium text-sm transition-all ${
            !productFile || !templateFile || converting
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
          }`}
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

        {downloadBlob && (
          <button onClick={handleDownload} className="px-6 py-3 rounded-xl font-medium text-sm bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow transition-all">
            Download eBay .xlsx
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {stats && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Products" value={stats.totalProducts} color="blue" />
          <StatCard label="Converted" value={stats.converted} color="green" />
          <StatCard label="Skipped (no SKU)" value={stats.skippedNoSku} color="yellow" />
          <StatCard label="Skipped (no title)" value={stats.skippedNoTitle} color="yellow" />
        </div>
      )}

      {stats && (
        <div className="mt-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Column Mapping</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-500">
            <MappingRow from="Tags (most specific)" to="Category name → auto-fills Category ID" />
            <MappingRow from="Variant SKU" to="Custom label (SKU)" />
            <MappingRow from="Title (80 char max)" to="Title" />
            <MappingRow from="Variant Price" to="Start price" />
            <MappingRow from="Total Inventory Qty" to="Quantity" />
            <MappingRow from="All Image Src (pipe-joined)" to="Item photo URL" />
            <MappingRow from="Body HTML" to="Description" />
            <MappingRow from="Vendor" to="Manufacturer Name" />
            <MappingRow from="Variant Barcode" to="P:EPID + C:Type" />
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Output is your eBay template with product data injected — all formulas, validations, and lookup sheets preserved.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'blue' | 'green' | 'yellow' }) {
  const styles = { blue: 'bg-blue-50 border-blue-200 text-blue-700', green: 'bg-green-50 border-green-200 text-green-700', yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700' };
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
      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">{from}</span>
      <span>→</span>
      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">{to}</span>
    </div>
  );
}
