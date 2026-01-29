'use client';

import React, { useState, useEffect } from 'react';

interface ChannelListing {
  id: string;
  product_id: string;
  platform: string;
  platform_listing_id: string;
  platform_url?: string;
  status: 'active' | 'paused' | 'error' | 'pending';
  synced_at?: string;
  sync_error?: string;
  products?: {
    title: string;
    images?: Array<{ src: string }>;
  };
}

interface ListingsManagerProps {
  onSyncRequired?: () => void;
}

export default function ListingsManager({ onSyncRequired }: ListingsManagerProps) {
  const [listings, setListings] = useState<ChannelListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [syncing, setSyncing] = useState(false);

  const limit = 20;

  useEffect(() => {
    fetchListings();
  }, [offset, selectedPlatform, selectedStatus]);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'listings',
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (selectedPlatform) params.append('platform', selectedPlatform);
      if (selectedStatus) params.append('status', selectedStatus);

      const res = await fetch(`/api/channels?${params}`);
      const data = await res.json();

      setListings(data.listings || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportEbay = async () => {
    try {
      const res = await fetch(
        `/api/channels?action=ebay-export&productIds=${JSON.stringify(
          listings.map(l => l.product_id)
        )}`
      );
      const csv = await res.text();

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ebay-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    pending: 'bg-blue-100 text-blue-800',
  };

  const platformIcons: Record<string, string> = {
    shopify: '🛍️',
    ebay: '🏷️',
    tiktok: '🎵',
    google: '🔍',
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end">
        <div className="flex gap-4 flex-1">
          <select
            value={selectedPlatform}
            onChange={e => {
              setSelectedPlatform(e.target.value);
              setOffset(0);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Platforms</option>
            <option value="shopify">Shopify</option>
            <option value="ebay">eBay</option>
            <option value="tiktok">TikTok</option>
            <option value="google">Google</option>
          </select>

          <select
            value={selectedStatus}
            onChange={e => {
              setSelectedStatus(e.target.value);
              setOffset(0);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="error">Error</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <button
          onClick={handleExportEbay}
          disabled={syncing || listings.length === 0}
          className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50 transition-colors"
        >
          📥 Export for eBay
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No listings found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map(listing => (
            <div
              key={listing.id}
              className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              {listing.products?.images?.[0]?.src && (
                <img
                  src={listing.products.images[0].src}
                  alt={listing.products.title}
                  className="w-full h-32 object-cover bg-gray-100"
                />
              )}

              <div className="p-4">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">
                    {platformIcons[listing.platform] || '📦'}
                  </span>
                  <h3 className="font-semibold text-sm text-gray-900 flex-1">
                    {listing.products?.title || 'Product'}
                  </h3>
                </div>

                <div className="space-y-2 text-sm">
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                      statusColors[listing.status] ||
                      'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {listing.status}
                  </span>

                  {listing.platform_url && (
                    <div>
                      <a
                        href={listing.platform_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline text-xs"
                      >
                        View Listing →
                      </a>
                    </div>
                  )}

                  {listing.synced_at && (
                    <div className="text-xs text-gray-500">
                      Synced: {new Date(listing.synced_at).toLocaleDateString()}
                    </div>
                  )}

                  {listing.sync_error && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      {listing.sync_error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}{' '}
            listings
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
