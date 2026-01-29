'use client';

import React, { useState } from 'react';
import ChannelOverview from './ChannelOverview';
import OrdersList from './OrdersList';
import ListingsManager from './ListingsManager';
import ShopifySync from './ShopifySync';

type TabType = 'overview' | 'orders' | 'listings' | 'sync';

interface ChannelsPanelFullProps {
  onRefresh?: () => void;
}

export default function ChannelsPanelFull({
  onRefresh,
}: ChannelsPanelFullProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  const tabs: Array<{ id: TabType; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'orders', label: 'Orders', icon: '📦' },
    { id: 'listings', label: 'Listings', icon: '🏷️' },
   // { id: 'sync', label: 'Sync Tools', icon: '🔄' },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Channel Status</h2>
            <ChannelOverview onRefresh={onRefresh} />
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                Unified Orders
              </h2>
              <button
                onClick={onRefresh}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
            <OrdersList
              onOrderSelect={order => {
                setSelectedOrder(order);
                setShowOrderDetails(true);
              }}
            />
          </div>
        )}

        {activeTab === 'listings' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">
              Channel Listings
            </h2>
            <ListingsManager />
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Sync Tools</h2>
            <ShopifySync
              onSyncComplete={result => {
                alert(
                  `Sync complete! Created: ${result.created}, Updated: ${result.updated}, Failed: ${result.failed}`
                );
                onRefresh?.();
              }}
            />
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {showOrderDetails && selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setShowOrderDetails(false)}
        />
      )}
    </div>
  );
}

function OrderDetailsModal({
  order,
  onClose,
}: {
  order: any;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">
            Order #{order.channel_order_id}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Customer Info */}
          <section>
            <h4 className="font-semibold text-gray-900 mb-3">
              Customer Information
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Name</div>
                <div className="font-medium text-gray-900">
                  {order.customer_name || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Email</div>
                <div className="font-medium text-gray-900">
                  {order.customer_email || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Phone</div>
                <div className="font-medium text-gray-900">
                  {order.customer_phone || 'N/A'}
                </div>
              </div>
            </div>
          </section>

          {/* Shipping Address */}
          <section>
            <h4 className="font-semibold text-gray-900 mb-3">
              Shipping Address
            </h4>
            <div className="text-sm text-gray-600">
              <div>{order.shipping_name}</div>
              <div>{order.shipping_address1}</div>
              {order.shipping_address2 && <div>{order.shipping_address2}</div>}
              <div>
                {order.shipping_city}, {order.shipping_state}{' '}
                {order.shipping_postal}
              </div>
              <div>{order.shipping_country}</div>
            </div>
          </section>

          {/* Order Items */}
          <section>
            <h4 className="font-semibold text-gray-900 mb-3">Items</h4>
            <div className="space-y-2">
              {order.items?.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex justify-between text-sm border-b pb-2"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {item.title}
                    </div>
                    <div className="text-gray-600">Qty: {item.quantity}</div>
                  </div>
                  <div className="text-right font-medium text-gray-900">
                    ${(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Order Summary */}
          <section className="bg-gray-50 p-4 rounded-lg">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">
                  ${order.subtotal?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping:</span>
                <span className="font-medium">
                  ${order.shipping_cost?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax:</span>
                <span className="font-medium">
                  ${order.tax?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total:</span>
                <span>${order.total?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
