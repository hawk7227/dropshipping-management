'use client';

// app/dashboard/page.tsx
// Main admin dashboard - central hub for all features

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface DashboardStats {
  revenue: {
    today: number;
    thisMonth: number;
    monthOverMonthChange: number;
  };
  orders: {
    today: number;
    pending: number;
  };
  members: {
    total: number;
    active: number;
    newThisMonth: number;
  };
  products: {
    active: number;
    lowStock: number;
  };
  priceTracking: {
    tracked: number;
    avgSavings: number;
  };
}

interface RecentOrder {
  id: string;
  channel: string;
  customer_name: string;
  total: number;
  status: string;
  ordered_at: string;
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  action?: string;
  actionUrl?: string;
}

const QUICK_ACTIONS = [
  { label: 'Add Product', href: '/products?action=create', icon: '📦' },
  { label: 'Sync Prices', href: '/prices?action=sync', icon: '💰' },
  { label: 'Create Post', href: '/social?action=create', icon: '📱' },
  { label: 'View Orders', href: '/channels', icon: '🛒' },
  { label: 'AI Generate', href: '/ai', icon: '🤖' },
  { label: 'Reports', href: '/analytics', icon: '📊' },
];

const NAVIGATION_CARDS = [
  {
    title: 'Products',
    description: 'Manage inventory, sync with Shopify, track stock levels',
    href: '/products',
    stats: ['active', 'lowStock'],
    color: 'from-blue-500 to-blue-600',
  },
  {
    title: 'Price Intelligence',
    description: 'Track competitor prices, optimize margins, Amazon sync',
    href: '/prices',
    stats: ['tracked', 'avgSavings'],
    color: 'from-green-500 to-green-600',
  },
  {
    title: 'Social & Marketing',
    description: 'AI content, social posts, email campaigns, SMS',
    href: '/social',
    color: 'from-purple-500 to-purple-600',
  },
  {
    title: 'Sales Channels',
    description: 'eBay, TikTok Shop, Google Merchant, unified orders',
    href: '/channels',
    color: 'from-orange-500 to-orange-600',
  },
  {
    title: 'AI Tools',
    description: 'Generate descriptions, SEO analysis, trend detection',
    href: '/ai',
    color: 'from-pink-500 to-pink-600',
  },
  {
    title: 'Analytics',
    description: 'Revenue reports, member insights, performance metrics',
    href: '/analytics',
    color: 'from-indigo-500 to-indigo-600',
  },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch overview stats
        const overviewRes = await fetch('/api/analytics?action=overview');
        const overviewData = await overviewRes.json();
        if (overviewData.success) {
          setStats(overviewData.data);
        }

        // Fetch recent orders
        const ordersRes = await fetch('/api/channels?action=orders&limit=5');
        const ordersData = await ordersRes.json();
        if (ordersData.success) {
          setRecentOrders(ordersData.data?.orders || ordersData.data || []);
        }

        // Generate alerts based on data
        const newAlerts: Alert[] = [];
        if (overviewData.data?.products?.lowStock > 0) {
          newAlerts.push({
            id: 'low-stock',
            type: 'warning',
            message: `${overviewData.data.products.lowStock} products are running low on stock`,
            action: 'View Products',
            actionUrl: '/products?filter=low-stock',
          });
        }
        if (overviewData.data?.priceTracking?.stale > 0) {
          newAlerts.push({
            id: 'stale-prices',
            type: 'info',
            message: `${overviewData.data.priceTracking.stale} product prices need updating`,
            action: 'Sync Prices',
            actionUrl: '/prices?action=sync',
          });
        }
        if (overviewData.data?.orders?.pending > 5) {
          newAlerts.push({
            id: 'pending-orders',
            type: 'warning',
            message: `${overviewData.data.orders.pending} orders awaiting fulfillment`,
            action: 'View Orders',
            actionUrl: '/channels?filter=unfulfilled',
          });
        }
        setAlerts(newAlerts);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Welcome back. Here's what's happening with your store.
          </p>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-3">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  alert.type === 'error'
                    ? 'bg-red-50 border-red-200'
                    : alert.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <span
                  className={`text-sm ${
                    alert.type === 'error'
                      ? 'text-red-700'
                      : alert.type === 'warning'
                      ? 'text-yellow-700'
                      : 'text-blue-700'
                  }`}
                >
                  {alert.message}
                </span>
                <div className="flex items-center gap-3">
                  {alert.action && alert.actionUrl && (
                    <Link
                      href={alert.actionUrl}
                      className={`text-sm font-medium ${
                        alert.type === 'error'
                          ? 'text-red-700 hover:text-red-800'
                          : alert.type === 'warning'
                          ? 'text-yellow-700 hover:text-yellow-800'
                          : 'text-blue-700 hover:text-blue-800'
                      }`}
                    >
                      {alert.action}
                    </Link>
                  )}
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Revenue Today</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(stats?.revenue.today || 0)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">This Month</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(stats?.revenue.thisMonth || 0)}
            </p>
            <p
              className={`text-xs mt-1 ${
                (stats?.revenue.monthOverMonthChange || 0) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {formatPercent(stats?.revenue.monthOverMonthChange || 0)} vs last month
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Orders Today</p>
            <p className="text-2xl font-semibold text-gray-900">{stats?.orders.today || 0}</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.orders.pending || 0} pending
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Active Members</p>
            <p className="text-2xl font-semibold text-gray-900">
              {stats?.members.active || 0}
            </p>
            <p className="text-xs text-green-600 mt-1">
              +{stats?.members.newThisMonth || 0} this month
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Price Savings</p>
            <p className="text-2xl font-semibold text-green-600">
              {(stats?.priceTracking.avgSavings || 0).toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">avg. vs competitors</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Quick Actions</h2>
          <div className="flex gap-3">
            {QUICK_ACTIONS.map(action => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all text-sm font-medium text-gray-700"
              >
                <span>{action.icon}</span>
                <span>{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-3 gap-6">
          {/* Navigation Cards */}
          <div className="col-span-2 space-y-4">
            <h2 className="text-sm font-medium text-gray-500">Manage Your Store</h2>
            <div className="grid grid-cols-2 gap-4">
              {NAVIGATION_CARDS.map(card => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all group"
                >
                  <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 mb-1">
                    {card.title}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{card.description}</p>
                  <div
                    className={`h-1 w-12 rounded bg-gradient-to-r ${card.color} opacity-60 group-hover:opacity-100 transition-opacity`}
                  ></div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Orders */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-500">Recent Orders</h2>
              <Link href="/channels" className="text-sm text-gray-600 hover:text-gray-900">
                View all
              </Link>
            </div>
            <div className="bg-white rounded-lg border border-gray-200">
              {recentOrders.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No recent orders</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recentOrders.slice(0, 5).map(order => (
                    <div key={order.id} className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900 text-sm">
                          {order.customer_name}
                        </span>
                        <span className="font-medium text-gray-900 text-sm">
                          {formatCurrency(order.total)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 capitalize">{order.channel}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            order.status === 'delivered'
                              ? 'bg-green-100 text-green-700'
                              : order.status === 'shipped'
                              ? 'bg-blue-100 text-blue-700'
                              : order.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inventory Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Inventory Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Active Products</span>
                  <span className="text-sm font-medium text-gray-900">
                    {stats?.products.active || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Low Stock Items</span>
                  <span className="text-sm font-medium text-yellow-600">
                    {stats?.products.lowStock || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Price Tracked</span>
                  <span className="text-sm font-medium text-gray-900">
                    {stats?.priceTracking.tracked || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Membership Link */}
        <div className="mt-8 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Membership Program</h3>
              <p className="text-gray-300 text-sm mt-1">
                {stats?.members.total || 0} total members · {stats?.members.active || 0} active
              </p>
            </div>
            <Link
              href="/membership"
              className="px-4 py-2 bg-white text-gray-900 rounded-lg font-medium text-sm hover:bg-gray-100 transition-colors"
            >
              Manage Membership
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
