'use client';

import React, { useState } from 'react';

interface ShopifySyncProps {
  onSyncComplete?: (result: any) => void;
}

export default function ShopifySync({ onSyncComplete }: ShopifySyncProps) {
  const [productIds, setProductIds] = useState<string[]>([]);
  const [syncMode, setSyncMode] = useState<'all' | 'new' | 'selected'>('all');
  const [syncing, setSyncing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const handleStartSync = async () => {
    setSyncing(true);

    try {
      let idsToSync: string[] = [];

      if (syncMode === 'selected') {
        // Parse from textarea
        const input = (document.getElementById('productIds') as HTMLTextAreaElement)
          ?.value;
        idsToSync = input
          .split('\n')
          .map(id => id.trim())
          .filter(id => id.length > 0);
      } else if (syncMode === 'all') {
        // Fetch all active products
        const res = await fetch('/api/products?action=list&status=active&pageSize=1000');
        const data = await res.json();
        const products = data.data?.products || (Array.isArray(data.data) ? data.data : []);
        idsToSync = products.map((p: any) => p.id) || [];
      } else if (syncMode === 'new') {
        // Fetch products without platform listings
        const res = await fetch('/api/products?action=list&status=active&pageSize=1000');
        const data = await res.json();
        const products = data.data?.products || (Array.isArray(data.data) ? data.data : []);
        // Filter products that haven't been synced (no shopify_product_id)
        idsToSync = products.filter((p: any) => !p.shopify_product_id).map((p: any) => p.id) || [];
      }

      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync-shopify',
          productIds: idsToSync,
        }),
      });

      const result = await res.json();
      setJobId(result.data.job_id);

      // Poll for status
      const interval = setInterval(async () => {
        const statusRes = await fetch(
          `/api/channels?action=queue-status&jobId=${result.data.job_id}`
        );
        const statusData = await statusRes.json();
        setJobStatus(statusData.data);

        if (
          statusData.data.status === 'completed' ||
          statusData.data.status === 'failed'
        ) {
          clearInterval(interval);
          setPollInterval(null);
          setSyncing(false);
          onSyncComplete?.(statusData.data);
        }
      }, 2000);

      setPollInterval(interval);
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncing(false);
    }
  };

  const handleStop = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setSyncing(false);
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync to Shopify</h3>

      {!jobId ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Sync Mode
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="all"
                  checked={syncMode === 'all'}
                  onChange={e => setSyncMode(e.target.value as any)}
                  disabled={syncing}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">All Active Products</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="new"
                  checked={syncMode === 'new'}
                  onChange={e => setSyncMode(e.target.value as any)}
                  disabled={syncing}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">
                  New Products (Not Yet Synced)
                </span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="selected"
                  checked={syncMode === 'selected'}
                  onChange={e => setSyncMode(e.target.value as any)}
                  disabled={syncing}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Selected Product IDs</span>
              </label>
            </div>
          </div>

          {syncMode === 'selected' && (
            <div>
              <label
                htmlFor="productIds"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Product IDs (one per line)
              </label>
              <textarea
                id="productIds"
                placeholder="product-id-1&#10;product-id-2&#10;product-id-3"
                disabled={syncing}
                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
              />
            </div>
          )}

          <button
            onClick={handleStartSync}
            disabled={syncing}
            className="w-full px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {syncing ? 'Starting Sync...' : '🛍️ Start Shopify Sync'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">
                Sync Progress
              </label>
              <span className="text-sm text-gray-600">
                {jobStatus?.processed || 0} / {jobStatus?.total || 0}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all duration-300"
                style={{
                  width: `${((jobStatus?.processed || 0) / (jobStatus?.total || 1)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-gray-600">Created</div>
              <div className="text-2xl font-bold text-green-600">
                {jobStatus?.created || 0}
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-gray-600">Updated</div>
              <div className="text-2xl font-bold text-blue-600">
                {jobStatus?.updated || 0}
              </div>
            </div>

            <div className="bg-red-50 p-3 rounded-lg">
              <div className="text-gray-600">Failed</div>
              <div className="text-2xl font-bold text-red-600">
                {jobStatus?.failed || 0}
              </div>
            </div>

            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="text-gray-600">Time Left</div>
              <div className="text-2xl font-bold text-purple-600">
                {jobStatus?.estimated_remaining_seconds || 0}s
              </div>
            </div>
          </div>

          <button
            onClick={handleStop}
            disabled={!syncing}
            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            ⏹️ Stop Sync
          </button>
        </div>
      )}
    </div>
  );
}
