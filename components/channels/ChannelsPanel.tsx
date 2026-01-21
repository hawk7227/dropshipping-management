'use client';

// components/channels/ChannelsPanel.tsx
// Multi-channel commerce management - eBay, TikTok, Google, Amazon orders

import React, { useState, useEffect, useCallback } from 'react';

interface ChannelStatus {
  configured: boolean;
  active: boolean;
  lastSync: string | null;
}

interface ChannelOrder {
  id: string;
  channel: string;
  channel_order_id: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  customer_name: string;
  customer_email?: string;
  shipping_address: {
    name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  line_items: Array<{
    product_id: string;
    sku?: string;
    title: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  shipping_cost: number;
  tax: number;
  total: number;
  fulfillment_status: 'unfulfilled' | 'partial' | 'fulfilled';
  tracking_number?: string;
  tracking_url?: string;
  ordered_at: string;
}

interface ChannelListing {
  id: string;
  product_id: string;
  channel: string;
  channel_product_id: string;
  channel_url?: string;
  status: 'active' | 'paused' | 'error';
  price: number;
  inventory: number;
  last_synced_at: string;
  products?: {
    title: string;
    images: Array<{ src: string }>;
  };
}

interface SyncResult {
  channel: string;
  synced: number;
  errors: string[];
}

type TabType = 'orders' | 'listings' | 'settings';

const CHANNEL_INFO: Record<string, { name: string; icon: string; color: string }> = {
  shopify: { name: 'Shopify', icon: '🛍️', color: 'bg-green-500' },
  ebay: { name: 'eBay', icon: '🏷️', color: 'bg-yellow-500' },
  tiktok: { name: 'TikTok Shop', icon: '🎵', color: 'bg-black' },
  google: { name: 'Google', icon: '🔍', color: 'bg-blue-500' },
  amazon: { name: 'Amazon', icon: '📦', color: 'bg-orange-500' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-gray-100 text-gray-700',
};

const FULFILLMENT_COLORS: Record<string, string> = {
  unfulfilled: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-orange-100 text-orange-700',
  fulfilled: 'bg-green-100 text-green-700',
};

export default function ChannelsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('orders');
  const [channelStatus, setChannelStatus] = useState<Record<string, ChannelStatus>>({});
  const [orders, setOrders] = useState<ChannelOrder[]>([]);
  const [listings, setListings] = useState<ChannelListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('');

  // Modal states
  const [selectedOrder, setSelectedOrder] = useState<ChannelOrder | null>(null);
  const [showFulfillModal, setShowFulfillModal] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const fetchChannelStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/channels?action=channel-status');
      const data = await res.json();
      if (data.success) {
        setChannelStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch channel status:', err);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: 'orders',
        page: page.toString(),
        pageSize: '25',
      });
      if (channelFilter) params.set('channel', channelFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (fulfillmentFilter) params.set('fulfillmentStatus', fulfillmentFilter);

      const res = await fetch(`/api/channels?${params}`);
      const data = await res.json();

      if (data.success) {
        setOrders(data.data.orders || data.data);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalOrders(data.pagination?.total || data.data?.length || 0);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [page, channelFilter, statusFilter, fulfillmentFilter]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: 'listings' });
      if (channelFilter) params.set('channel', channelFilter);

      const res = await fetch(`/api/channels?${params}`);
      const data = await res.json();

      if (data.success) {
        setListings(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch listings');
    } finally {
      setLoading(false);
    }
  }, [channelFilter]);

  useEffect(() => {
    fetchChannelStatus();
  }, [fetchChannelStatus]);

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders();
    } else if (activeTab === 'listings') {
      fetchListings();
    }
  }, [activeTab, fetchOrders, fetchListings]);

  const handleSyncOrders = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/channels?action=sync-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (data.success) {
        const results = data.data as SyncResult[];
        const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

        if (totalErrors > 0) {
          setError(`Synced ${totalSynced} orders with ${totalErrors} errors`);
        }

        fetchOrders();
        fetchChannelStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to sync orders');
    } finally {
      setSyncing(false);
    }
  };

  const handleFulfillOrder = async () => {
    if (!selectedOrder || !trackingNumber) return;

    try {
      const res = await fetch('/api/channels?action=update-fulfillment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          trackingNumber,
          trackingUrl: trackingUrl || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowFulfillModal(false);
        setSelectedOrder(null);
        setTrackingNumber('');
        setTrackingUrl('');
        fetchOrders();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fulfill order');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getActiveChannelCount = () => {
    return Object.values(channelStatus).filter(s => s.configured && s.active).length;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Sales Channels</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage orders and listings across all your sales channels
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSyncOrders}
              disabled={syncing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {syncing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></span>
                  Syncing...
                </span>
              ) : (
                'Sync Orders'
              )}
            </button>
          </div>
        </div>

        {/* Channel Status Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {Object.entries(CHANNEL_INFO).map(([key, info]) => {
            const status = channelStatus[key];
            return (
              <div
                key={key}
                className={`p-4 rounded-lg border ${
                  status?.configured
                    ? status.active
                      ? 'border-green-200 bg-green-50'
                      : 'border-yellow-200 bg-yellow-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{info.icon}</span>
                  <span className="font-medium text-gray-900">{info.name}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {status?.configured ? (
                    status.active ? (
                      <span className="text-green-600">Connected</span>
                    ) : (
                      <span className="text-yellow-600">Inactive</span>
                    )
                  ) : (
                    <span className="text-gray-400">Not configured</span>
                  )}
                </div>
                {status?.lastSync && (
                  <div className="text-xs text-gray-400 mt-1">
                    Last sync: {new Date(status.lastSync).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['orders', 'listings', 'settings'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setPage(1);
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
              {tab === 'orders' && totalOrders > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-gray-200 rounded-full">
                  {totalOrders}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      {(activeTab === 'orders' || activeTab === 'listings') && (
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-4">
            <select
              value={channelFilter}
              onChange={e => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All Channels</option>
              {Object.entries(CHANNEL_INFO).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.name}
                </option>
              ))}
            </select>
            {activeTab === 'orders' && (
              <>
                <select
                  value={statusFilter}
                  onChange={e => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  value={fulfillmentFilter}
                  onChange={e => {
                    setFulfillmentFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">All Fulfillment</option>
                  <option value="unfulfilled">Unfulfilled</option>
                  <option value="partial">Partial</option>
                  <option value="fulfilled">Fulfilled</option>
                </select>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <>
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                {orders.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No orders found</p>
                    <p className="text-sm mt-1">
                      {getActiveChannelCount() === 0
                        ? 'Configure a sales channel to start receiving orders'
                        : 'Try syncing orders or adjusting filters'}
                    </p>
                  </div>
                ) : (
                  orders.map(order => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${
                              CHANNEL_INFO[order.channel]?.color || 'bg-gray-500'
                            }`}
                          >
                            <span className="text-lg">
                              {CHANNEL_INFO[order.channel]?.icon || '📦'}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">
                                #{order.channel_order_id}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {order.status}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  FULFILLMENT_COLORS[order.fulfillment_status] || 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {order.fulfillment_status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">{order.customer_name}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              <span>{CHANNEL_INFO[order.channel]?.name || order.channel}</span>
                              <span>{order.line_items.length} item(s)</span>
                              <span>{formatDate(order.ordered_at)}</span>
                              {order.tracking_number && (
                                <span className="text-blue-600">
                                  Tracking: {order.tracking_number}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{formatCurrency(order.total)}</p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                              View
                            </button>
                            {order.fulfillment_status === 'unfulfilled' && (
                              <button
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setShowFulfillModal(true);
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
                              >
                                Fulfill
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Line Items Preview */}
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex gap-4 overflow-x-auto">
                          {order.line_items.slice(0, 4).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 min-w-0">
                              <div className="w-10 h-10 bg-gray-100 rounded flex-shrink-0"></div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">
                                  {item.title}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {item.quantity} × {formatCurrency(item.price)}
                                </p>
                              </div>
                            </div>
                          ))}
                          {order.line_items.length > 4 && (
                            <div className="flex items-center text-xs text-gray-500">
                              +{order.line_items.length - 4} more
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Listings Tab */}
            {activeTab === 'listings' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Product</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Channel</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Price</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Inventory</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Last Sync</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-gray-500">
                          No listings found
                        </td>
                      </tr>
                    ) : (
                      listings.map(listing => (
                        <tr key={listing.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden">
                                {listing.products?.images?.[0] && (
                                  <img
                                    src={listing.products.images[0].src}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <span className="font-medium text-gray-900 truncate max-w-xs">
                                {listing.products?.title || listing.product_id}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span>{CHANNEL_INFO[listing.channel]?.icon || '📦'}</span>
                              <span className="text-sm text-gray-700">
                                {CHANNEL_INFO[listing.channel]?.name || listing.channel}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                listing.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : listing.status === 'paused'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {listing.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-gray-900">
                            {formatCurrency(listing.price)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`text-sm ${
                                listing.inventory === 0
                                  ? 'text-red-600'
                                  : listing.inventory < 10
                                  ? 'text-yellow-600'
                                  : 'text-gray-900'
                              }`}
                            >
                              {listing.inventory}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">
                            {formatDate(listing.last_synced_at)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {listing.channel_url && (
                              <a
                                href={listing.channel_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline"
                              >
                                View
                              </a>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                {Object.entries(CHANNEL_INFO).map(([key, info]) => {
                  const status = channelStatus[key];
                  return (
                    <div
                      key={key}
                      className="border border-gray-200 rounded-lg p-6"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-lg flex items-center justify-center text-white ${info.color}`}
                          >
                            <span className="text-2xl">{info.icon}</span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{info.name}</h3>
                            <p className="text-sm text-gray-500">
                              {status?.configured
                                ? status.active
                                  ? 'Connected and active'
                                  : 'Connected but inactive'
                                : 'Not configured'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {status?.configured ? (
                            <>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={status.active}
                                  onChange={() => {}}
                                  className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                                />
                                <span className="text-sm text-gray-700">Active</span>
                              </label>
                              <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                                Configure
                              </button>
                            </>
                          ) : (
                            <button className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800">
                              Connect
                            </button>
                          )}
                        </div>
                      </div>
                      {status?.lastSync && (
                        <p className="text-xs text-gray-500">
                          Last synchronized: {formatDate(status.lastSync)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && activeTab === 'orders' && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && !showFulfillModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Order #{selectedOrder.channel_order_id}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {CHANNEL_INFO[selectedOrder.channel]?.name || selectedOrder.channel}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Customer Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Customer</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium text-gray-900">{selectedOrder.customer_name}</p>
                  {selectedOrder.customer_email && (
                    <p className="text-sm text-gray-600">{selectedOrder.customer_email}</p>
                  )}
                </div>
              </div>

              {/* Shipping Address */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Shipping Address</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-900">{selectedOrder.shipping_address.name}</p>
                  <p className="text-gray-600">{selectedOrder.shipping_address.address_line1}</p>
                  {selectedOrder.shipping_address.address_line2 && (
                    <p className="text-gray-600">{selectedOrder.shipping_address.address_line2}</p>
                  )}
                  <p className="text-gray-600">
                    {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.state}{' '}
                    {selectedOrder.shipping_address.postal_code}
                  </p>
                  <p className="text-gray-600">{selectedOrder.shipping_address.country}</p>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Items</h4>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
                  {selectedOrder.line_items.map((item, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{item.title}</p>
                        <p className="text-sm text-gray-500">
                          {item.sku && `SKU: ${item.sku} · `}Qty: {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium text-gray-900">{formatCurrency(item.total)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Totals */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Shipping</span>
                  <span className="text-gray-900">{formatCurrency(selectedOrder.shipping_cost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="text-gray-900">{formatCurrency(selectedOrder.tax)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t border-gray-200">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>

              {/* Tracking Info */}
              {selectedOrder.tracking_number && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Tracking</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="font-mono text-gray-900">{selectedOrder.tracking_number}</p>
                    {selectedOrder.tracking_url && (
                      <a
                        href={selectedOrder.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Track Package
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
              {selectedOrder.fulfillment_status === 'unfulfilled' && (
                <button
                  onClick={() => setShowFulfillModal(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
                >
                  Mark as Fulfilled
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fulfill Order Modal */}
      {showFulfillModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Fulfill Order</h3>
              <p className="text-sm text-gray-500 mt-1">
                Order #{selectedOrder.channel_order_id}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tracking Number *
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={e => setTrackingNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Enter tracking number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tracking URL (optional)
                </label>
                <input
                  type="url"
                  value={trackingUrl}
                  onChange={e => setTrackingUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowFulfillModal(false);
                  setTrackingNumber('');
                  setTrackingUrl('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleFulfillOrder}
                disabled={!trackingNumber}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Fulfillment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
