'use client';

import React, { useState, useEffect } from 'react';

interface UnifiedOrder {
  id: string;
  channel: string;
  channel_order_id: string;
  status: string;
  customer_name: string;
  customer_email?: string;
  total: number;
  channel_created_at: string;
  items: Array<{
    title: string;
    quantity: number;
    price: number;
  }>;
  shipping_address1?: string;
  shipping_city?: string;
  shipping_state?: string;
}

interface OrdersListProps {
  onOrderSelect?: (order: UnifiedOrder) => void;
}

export default function OrdersList({ onOrderSelect }: OrdersListProps) {
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const limit = 25;

  useEffect(() => {
    fetchOrders();
  }, [offset, selectedChannel, selectedStatus]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'orders',
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (selectedChannel) params.append('channel', selectedChannel);
      if (selectedStatus) params.append('status', selectedStatus);

      const res = await fetch(`/api/channels?${params}`);
      const data = await res.json();

      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    refunded: 'bg-gray-100 text-gray-800',
  };

  const channelIcons: Record<string, string> = {
    shopify: '🛍️',
    ebay: '🏷️',
    tiktok: '🎵',
    google: '🔍',
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <select
          value={selectedChannel}
          onChange={e => {
            setSelectedChannel(e.target.value);
            setOffset(0);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Channels</option>
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
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No orders found</div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  Order ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  Channel
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  Items
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr
                  key={order.id}
                  className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onOrderSelect?.(order)}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    #{order.channel_order_id}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="text-lg">
                      {channelIcons[order.channel] || '📦'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div>{order.customer_name || 'N/A'}</div>
                    <div className="text-xs text-gray-500">{order.customer_email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {order.items?.length || 0} item(s)
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                    ${order.total?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        statusColors[order.status] ||
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(order.channel_created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} orders
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const page = currentPage - 2 + i;
                if (page < 1 || page > totalPages) return null;
                return (
                  <button
                    key={page}
                    onClick={() => setOffset((page - 1) * limit)}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      currentPage === page
                        ? 'bg-blue-500 text-white'
                        : 'border border-gray-300'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
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
