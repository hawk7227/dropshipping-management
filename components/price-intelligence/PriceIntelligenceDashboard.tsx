'use client';

// components/price-intelligence/PriceIntelligenceDashboard.tsx
// Complete Price Intelligence Dashboard with competitor tracking and margin analysis

import React, { useState, useEffect } from 'react';

interface CompetitorPrice {
  competitor: string;
  price: number;
  in_stock: boolean;
  rating?: number;
}

interface PriceProduct {
  id: string;
  title: string;
  cost_price: number;
  our_price: number;
  amazon_price?: number;
  walmart_price?: number;
  ebay_price?: number;
  lowest_competitor: number;
  margin_percentage: number;
  margin_status: 'healthy' | 'warning' | 'critical';
}

interface DashboardStats {
  tracked_products: number;
  avg_margin: number;
  stale_prices: number;
  critical_alerts: number;
  margin_status: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

export default function PriceIntelligenceDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [products, setProducts] = useState<PriceProduct[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'alerts' | 'rules'>('overview');
  const [syncingProducts, setSyncingProducts] = useState<string[]>([]);
  const [selectedMarginStatus, setSelectedMarginStatus] = useState<'all' | 'healthy' | 'warning' | 'critical'>('all');
  const [showMarginRules, setShowMarginRules] = useState(false);

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, productsRes, alertsRes] = await Promise.all([
        fetch('/api/prices/intelligence?action=stats'),
        fetch(`/api/prices/intelligence?action=comparison&marginStatus=${selectedMarginStatus === 'all' ? '' : selectedMarginStatus}`),
        fetch('/api/prices/intelligence?action=alerts&limit=10'),
      ]);

      const statsData = await statsRes.json();
      const productsData = await productsRes.json();
      const alertsData = await alertsRes.json();

      setStats(statsData.data);
      setProducts(productsData.data || []);
      setAlerts(alertsData.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMarginStatus]);

  // Sync single product prices
  const syncProductPrices = async (productId: string, asin: string) => {
    setSyncingProducts([...syncingProducts, productId]);
    try {
      const res = await fetch('/api/prices/intelligence?action=sync-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, asin }),
      });

      if (res.ok) {
        // Refresh products list
        await fetchData();
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncingProducts(syncingProducts.filter(id => id !== productId));
    }
  };

  // Apply margin rule
  const applyMarginRule = async (productId: string, dryRun: boolean = true) => {
    try {
      const res = await fetch('/api/prices/intelligence?action=apply-margin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          minMargin: 0.25,
          targetMargin: 0.35,
          maxMargin: 0.5,
          dryRun,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await fetchData();
        }
      }
    } catch (error) {
      console.error('Margin rule error:', error);
    }
  };

  const getMarginColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'critical':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getMarginIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'critical':
        return '🔴';
      default:
        return '•';
    }
  };

  if (loading && !stats) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-gray-200 h-32 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">💰 Price Intelligence Dashboard</h2>
        <p className="text-gray-600">
          Monitor competitor prices, analyze margins, and optimize pricing strategies
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Tracked Products</p>
                <p className="text-3xl font-bold text-gray-900">{stats.tracked_products}</p>
              </div>
              <div className="text-3xl">📦</div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Average Margin</p>
                <p className="text-3xl font-bold text-green-600">{stats.avg_margin.toFixed(1)}%</p>
              </div>
              <div className="text-3xl">📈</div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {stats.margin_status.healthy} healthy, {stats.margin_status.warning} warning, {stats.margin_status.critical} critical
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Stale Prices</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.stale_prices}</p>
              </div>
              <div className="text-3xl">⏰</div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Older than 24 hours</p>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Critical Alerts</p>
                <p className="text-3xl font-bold text-red-600">{stats.critical_alerts}</p>
              </div>
              <div className="text-3xl">🚨</div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Requiring action</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex gap-4 px-6">
          {['overview', 'products', 'alerts', 'rules'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-4 px-4 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              {tab === 'overview' && '📊 Overview'}
              {tab === 'products' && '📦 Products'}
              {tab === 'alerts' && '⚠️ Alerts'}
              {tab === 'rules' && '⚙️ Margin Rules'}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Margin Distribution */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="font-medium text-gray-900 mb-4">Margin Distribution</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">Healthy (≥35%)</span>
                  <span className="font-medium text-green-600">{stats.margin_status.healthy}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${(stats.margin_status.healthy / stats.tracked_products) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">Warning (25-34%)</span>
                  <span className="font-medium text-yellow-600">{stats.margin_status.warning}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500"
                    style={{
                      width: `${(stats.margin_status.warning / stats.tracked_products) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">Critical (&lt;25%)</span>
                  <span className="font-medium text-red-600">{stats.margin_status.critical}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{
                      width: `${(stats.margin_status.critical / stats.tracked_products) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
                🔄 Sync All Prices
              </button>
              <button className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors">
                ✅ Apply Margin Rules
              </button>
              <button className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors">
                📊 Generate Report
              </button>
              <button
                onClick={() => setShowMarginRules(!showMarginRules)}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                ⚙️ Manage Rules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <div>
              <h3 className="font-medium text-gray-900">Price Comparison</h3>
              <p className="text-xs text-gray-600 mt-1">Showing {products.length} products</p>
            </div>
            <select
              value={selectedMarginStatus}
              onChange={(e) => setSelectedMarginStatus(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-3 py-2"
            >
              <option value="all">All Margins</option>
              <option value="healthy">Healthy Only</option>
              <option value="warning">Warnings</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Our Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Competitor Low</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Margin</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map(product => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">{product.title}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">${product.our_price.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">${product.lowest_competitor.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{product.margin_percentage.toFixed(1)}%</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${getMarginColor(product.margin_status)}`}>
                        {getMarginIcon(product.margin_status)} {product.margin_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => syncProductPrices(product.id, '')}
                          disabled={syncingProducts.includes(product.id)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-600 hover:bg-blue-200 rounded disabled:opacity-50"
                        >
                          {syncingProducts.includes(product.id) ? '⏳' : '🔄'} Sync
                        </button>
                        <button
                          onClick={() => applyMarginRule(product.id)}
                          className="px-2 py-1 text-xs bg-green-100 text-green-600 hover:bg-green-200 rounded"
                        >
                          ✅ Apply Rule
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="bg-white p-8 rounded-lg text-center">
              <p className="text-gray-600">No alerts at this time</p>
            </div>
          ) : (
            alerts.map((alert, i) => (
              <div key={i} className="bg-white p-4 rounded-lg border-l-4 border-yellow-500">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{alert.message}</p>
                    <p className="text-xs text-gray-600 mt-1">Type: {alert.type}</p>
                  </div>
                  <button className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Resolve</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="font-medium text-gray-900 mb-4">Margin Rules</h3>
          <p className="text-sm text-gray-600 mb-4">
            Define automatic pricing rules to maintain healthy margins across your products
          </p>
          
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-blue-50">
              <h4 className="font-medium text-gray-900 mb-2">Standard Rule</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Min Margin:</span>
                  <p className="font-medium">25%</p>
                </div>
                <div>
                  <span className="text-gray-600">Target Margin:</span>
                  <p className="font-medium">35%</p>
                </div>
                <div>
                  <span className="text-gray-600">Max Margin:</span>
                  <p className="font-medium">50%</p>
                </div>
              </div>
              <button className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded">
                Apply to All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
