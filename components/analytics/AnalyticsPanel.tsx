'use client';

// components/analytics/AnalyticsPanel.tsx
// Full analytics dashboard with revenue, members, channels, products metrics

import React, { useState, useEffect, useCallback } from 'react';

interface DashboardOverview {
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
    monthOverMonthChange: number;
  };
  orders: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    pending: number;
  };
  members: {
    total: number;
    active: number;
    newThisMonth: number;
    churnRate: number;
  };
  products: {
    total: number;
    active: number;
    lowStock: number;
    outOfStock: number;
  };
  priceTracking: {
    tracked: number;
    avgSavings: number;
    stale: number;
  };
}

interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

interface TopProduct {
  product_id: string;
  title: string;
  total_revenue: number;
  total_purchases: number;
  total_views: number;
  conversion_rate: number;
}

interface ChannelPerformance {
  channel: string;
  revenue: number;
  orders: number;
  average_order_value: number;
  conversion_rate: number;
}

interface MemberAnalytic {
  id: string;
  user_id: string;
  email?: string;
  lifetime_value: number;
  total_orders: number;
  avg_order_value: number;
  member_since: string;
  last_order_at?: string;
  churn_risk_score: number;
}

type TabType = 'overview' | 'revenue' | 'members' | 'products' | 'channels';
type DateRange = '7d' | '30d' | '90d' | '1y';

export default function AnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [revenueChart, setRevenueChart] = useState<ChartDataPoint[]>([]);
  const [memberGrowth, setMemberGrowth] = useState<ChartDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [channelPerformance, setChannelPerformance] = useState<ChannelPerformance[]>([]);
  const [highValueMembers, setHighValueMembers] = useState<MemberAnalytic[]>([]);
  const [churnRiskMembers, setChurnRiskMembers] = useState<MemberAnalytic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics?action=dashboard');
      const data = await res.json();
      if (data.success) {
        setOverview(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    }
  }, []);

  const fetchRevenueChart = useCallback(async () => {
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
      const res = await fetch(`/api/analytics?action=revenue-chart&days=${days}`);
      const data = await res.json();
      if (data.success) {
        setRevenueChart(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch revenue chart:', err);
    }
  }, [dateRange]);

  const fetchMemberGrowth = useCallback(async () => {
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
      const res = await fetch(`/api/analytics?action=member-growth&days=${days}`);
      const data = await res.json();
      if (data.success) {
        setMemberGrowth(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch member growth:', err);
    }
  }, [dateRange]);

  const fetchTopProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics?action=top-products&limit=10&sortBy=revenue');
      const data = await res.json();
      if (data.success) {
        setTopProducts(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch top products:', err);
    }
  }, []);

  const fetchChannelPerformance = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics?action=channel-comparison');
      const data = await res.json();
      if (data.success) {
        setChannelPerformance(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch channel performance:', err);
    }
  }, []);

  const fetchMemberAnalytics = useCallback(async () => {
    try {
      const [highValueRes, churnRiskRes] = await Promise.all([
        fetch('/api/analytics?action=high-value-members&limit=10'),
        fetch('/api/analytics?action=churn-risk&limit=10'),
      ]);

      const highValueData = await highValueRes.json();
      const churnRiskData = await churnRiskRes.json();

      if (highValueData.success) setHighValueMembers(highValueData.data);
      if (churnRiskData.success) setChurnRiskMembers(churnRiskData.data);
    } catch (err) {
      console.error('Failed to fetch member analytics:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchOverview();
        await fetchRevenueChart();
        await fetchMemberGrowth();
        await fetchTopProducts();
        await fetchChannelPerformance();
        await fetchMemberAnalytics();
      } catch (err) {
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchOverview, fetchRevenueChart, fetchMemberGrowth, fetchTopProducts, fetchChannelPerformance, fetchMemberAnalytics]);

  useEffect(() => {
    fetchRevenueChart();
    fetchMemberGrowth();
  }, [dateRange, fetchRevenueChart, fetchMemberGrowth]);

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

  const getMaxChartValue = (data: ChartDataPoint[]) => {
    return Math.max(...data.map(d => d.value), 1);
  };

  const renderSimpleBarChart = (data: ChartDataPoint[], color: string = 'bg-gray-900') => {
    const maxValue = getMaxChartValue(data);

    return (
      <div className="flex items-end gap-1 h-40">
        {data.map((point, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full ${color} rounded-t transition-all duration-300`}
              style={{ height: `${(point.value / maxValue) * 100}%`, minHeight: point.value > 0 ? 4 : 0 }}
              title={`${point.label || point.date}: ${formatCurrency(point.value)}`}
            />
            {data.length <= 12 && (
              <span className="text-xs text-gray-400 truncate w-full text-center">
                {point.date.slice(-5)}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderLineIndicator = (data: ChartDataPoint[]) => {
    if (data.length < 2) return null;

    const maxValue = getMaxChartValue(data);
    const points = data.map((d, i) => ({
      x: (i / (data.length - 1)) * 100,
      y: 100 - (d.value / maxValue) * 100,
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <svg viewBox="0 0 100 100" className="w-full h-32" preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke="#111827" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#111827" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Analytics</h2>
            <p className="text-sm text-gray-500 mt-1">
              Track performance across revenue, members, products, and channels
            </p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRange)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
            </select>
            <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
              Export Report
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['overview', 'revenue', 'members', 'products', 'channels'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && overview && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Revenue This Month</p>
                <p className="text-3xl font-semibold text-gray-900">
                  {formatCurrency(overview.revenue.thisMonth)}
                </p>
                <p className={`text-sm mt-1 ${overview.revenue.monthOverMonthChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(overview.revenue.monthOverMonthChange)} vs last month
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Orders This Month</p>
                <p className="text-3xl font-semibold text-gray-900">
                  {overview.orders.thisMonth.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {overview.orders.pending} pending fulfillment
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Active Members</p>
                <p className="text-3xl font-semibold text-gray-900">
                  {overview.members.active.toLocaleString()}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  +{overview.members.newThisMonth} new this month
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Price Savings</p>
                <p className="text-3xl font-semibold text-green-600">
                  {overview.priceTracking.avgSavings.toFixed(0)}%
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  avg. vs competitors
                </p>
              </div>
            </div>

            {/* Revenue Chart */}
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-medium text-gray-900 mb-4">Revenue Trend</h3>
              {revenueChart.length > 0 ? (
                renderSimpleBarChart(revenueChart)
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400">
                  No revenue data available
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-3">Products</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Active Products</span>
                    <span className="font-medium text-gray-900">{overview.products.active}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Low Stock</span>
                    <span className="font-medium text-yellow-600">{overview.products.lowStock}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Out of Stock</span>
                    <span className="font-medium text-red-600">{overview.products.outOfStock}</span>
                  </div>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-3">Members</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Members</span>
                    <span className="font-medium text-gray-900">{overview.members.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Active This Month</span>
                    <span className="font-medium text-gray-900">{overview.members.active}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Churn Rate</span>
                    <span className="font-medium text-gray-900">{overview.members.churnRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-3">Price Tracking</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tracked Products</span>
                    <span className="font-medium text-gray-900">{overview.priceTracking.tracked}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Avg. Savings</span>
                    <span className="font-medium text-green-600">{overview.priceTracking.avgSavings.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Needs Update</span>
                    <span className="font-medium text-yellow-600">{overview.priceTracking.stale}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Today</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(overview?.revenue.today || 0)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">This Week</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(overview?.revenue.thisWeek || 0)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">This Month</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(overview?.revenue.thisMonth || 0)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Last Month</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(overview?.revenue.lastMonth || 0)}
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-medium text-gray-900 mb-4">Daily Revenue</h3>
              {revenueChart.length > 0 ? (
                renderSimpleBarChart(revenueChart)
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400">
                  No revenue data available
                </div>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-medium text-gray-900 mb-4">Top Products by Revenue</h3>
              <div className="space-y-3">
                {topProducts.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No product data available</p>
                ) : (
                  topProducts.map((product, idx) => (
                    <div key={product.product_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400 w-6">{idx + 1}.</span>
                        <span className="font-medium text-gray-900">{product.title}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-gray-500">{product.total_purchases} sales</span>
                        <span className="font-medium text-gray-900">{formatCurrency(product.total_revenue)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Total Members</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {overview?.members.total || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Active</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {overview?.members.active || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">New This Month</p>
                <p className="text-2xl font-semibold text-green-600">
                  +{overview?.members.newThisMonth || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Churn Rate</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {overview?.members.churnRate.toFixed(1) || 0}%
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-medium text-gray-900 mb-4">Member Growth</h3>
              {memberGrowth.length > 0 ? (
                renderLineIndicator(memberGrowth)
              ) : (
                <div className="h-32 flex items-center justify-center text-gray-400">
                  No growth data available
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-medium text-gray-900 mb-4">High-Value Members</h3>
                <div className="space-y-3">
                  {highValueMembers.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">No data available</p>
                  ) : (
                    highValueMembers.slice(0, 5).map(member => (
                      <div key={member.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div>
                          <p className="font-medium text-gray-900">{member.email || member.user_id}</p>
                          <p className="text-xs text-gray-500">{member.total_orders} orders</p>
                        </div>
                        <span className="font-medium text-green-600">{formatCurrency(member.lifetime_value)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-medium text-gray-900 mb-4">Churn Risk</h3>
                <div className="space-y-3">
                  {churnRiskMembers.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">No at-risk members</p>
                  ) : (
                    churnRiskMembers.slice(0, 5).map(member => (
                      <div key={member.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div>
                          <p className="font-medium text-gray-900">{member.email || member.user_id}</p>
                          <p className="text-xs text-gray-500">
                            Last order: {member.last_order_at ? new Date(member.last_order_at).toLocaleDateString() : 'Never'}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          member.churn_risk_score >= 0.7 ? 'bg-red-100 text-red-700' :
                          member.churn_risk_score >= 0.4 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {(member.churn_risk_score * 100).toFixed(0)}% risk
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Total Products</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {overview?.products.total || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Active</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {overview?.products.active || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Low Stock</p>
                <p className="text-2xl font-semibold text-yellow-600">
                  {overview?.products.lowStock || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5">
                <p className="text-sm text-gray-500 mb-1">Out of Stock</p>
                <p className="text-2xl font-semibold text-red-600">
                  {overview?.products.outOfStock || 0}
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-medium text-gray-900 mb-4">Top Performing Products</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 text-sm font-medium text-gray-500">Product</th>
                    <th className="text-right py-3 text-sm font-medium text-gray-500">Revenue</th>
                    <th className="text-right py-3 text-sm font-medium text-gray-500">Sales</th>
                    <th className="text-right py-3 text-sm font-medium text-gray-500">Views</th>
                    <th className="text-right py-3 text-sm font-medium text-gray-500">Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-gray-400">
                        No product data available
                      </td>
                    </tr>
                  ) : (
                    topProducts.map(product => (
                      <tr key={product.product_id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 font-medium text-gray-900">{product.title}</td>
                        <td className="py-3 text-right text-gray-900">{formatCurrency(product.total_revenue)}</td>
                        <td className="py-3 text-right text-gray-600">{product.total_purchases}</td>
                        <td className="py-3 text-right text-gray-600">{product.total_views}</td>
                        <td className="py-3 text-right">
                          <span className={`${product.conversion_rate >= 5 ? 'text-green-600' : product.conversion_rate >= 2 ? 'text-yellow-600' : 'text-gray-600'}`}>
                            {product.conversion_rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Channels Tab */}
        {activeTab === 'channels' && (
          <div className="space-y-6">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-500">Channel</th>
                    <th className="text-right py-4 px-6 text-sm font-medium text-gray-500">Revenue</th>
                    <th className="text-right py-4 px-6 text-sm font-medium text-gray-500">Orders</th>
                    <th className="text-right py-4 px-6 text-sm font-medium text-gray-500">AOV</th>
                    <th className="text-right py-4 px-6 text-sm font-medium text-gray-500">Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {channelPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400">
                        No channel data available
                      </td>
                    </tr>
                  ) : (
                    channelPerformance.map(channel => (
                      <tr key={channel.channel} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <span className="font-medium text-gray-900 capitalize">{channel.channel}</span>
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-gray-900">
                          {formatCurrency(channel.revenue)}
                        </td>
                        <td className="py-4 px-6 text-right text-gray-600">
                          {channel.orders.toLocaleString()}
                        </td>
                        <td className="py-4 px-6 text-right text-gray-600">
                          {formatCurrency(channel.average_order_value)}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <span className={`${channel.conversion_rate >= 5 ? 'text-green-600' : 'text-gray-600'}`}>
                            {channel.conversion_rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Channel Revenue Distribution */}
            {channelPerformance.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-medium text-gray-900 mb-4">Revenue Distribution</h3>
                <div className="flex gap-2 h-8 rounded overflow-hidden">
                  {(() => {
                    const totalRevenue = channelPerformance.reduce((sum, c) => sum + c.revenue, 0);
                    const colors = ['bg-gray-900', 'bg-gray-700', 'bg-gray-500', 'bg-gray-400', 'bg-gray-300'];
                    return channelPerformance.map((channel, idx) => {
                      const percentage = totalRevenue > 0 ? (channel.revenue / totalRevenue) * 100 : 0;
                      return (
                        <div
                          key={channel.channel}
                          className={`${colors[idx % colors.length]} flex items-center justify-center text-white text-xs font-medium`}
                          style={{ width: `${percentage}%` }}
                          title={`${channel.channel}: ${formatCurrency(channel.revenue)} (${percentage.toFixed(1)}%)`}
                        >
                          {percentage > 10 && channel.channel}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="flex flex-wrap gap-4 mt-4">
                  {channelPerformance.map((channel, idx) => {
                    const colors = ['bg-gray-900', 'bg-gray-700', 'bg-gray-500', 'bg-gray-400', 'bg-gray-300'];
                    const totalRevenue = channelPerformance.reduce((sum, c) => sum + c.revenue, 0);
                    const percentage = totalRevenue > 0 ? (channel.revenue / totalRevenue) * 100 : 0;
                    return (
                      <div key={channel.channel} className="flex items-center gap-2 text-sm">
                        <div className={`w-3 h-3 rounded ${colors[idx % colors.length]}`}></div>
                        <span className="text-gray-600 capitalize">{channel.channel}</span>
                        <span className="text-gray-400">({percentage.toFixed(1)}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
