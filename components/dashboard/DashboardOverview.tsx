'use client';

import React, { useState, useEffect } from 'react';
import { Card, StatCard, Spinner, ErrorAlert, Badge, Button } from '@/components/ui';

interface DashboardOverview {
  today: {
    revenue: number;
    orders: number;
    newMembers: number;
    pageViews: number;
  };
  week: {
    revenue: number;
    orders: number;
    newMembers: number;
    memberSavings: number;
  };
  month: {
    revenue: number;
    orders: number;
    newMembers: number;
    churnedMembers: number;
  };
  products: {
    total: number;
    active: number;
    lowStock: number;
    outOfStock: number;
  };
  members: {
    total: number;
    active: number;
    avgLifetimeValue: number;
  };
  prices: {
    tracked: number;
    avgSavings: number;
    staleCount: number;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function DashboardOverviewPanel() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error('Failed to fetch dashboard');
      const result = await response.json();
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorAlert message={error} onDismiss={() => setError(null)} />;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Today's Stats */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Today</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Revenue"
            value={formatCurrency(data.today.revenue)}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Orders"
            value={formatNumber(data.today.orders)}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            }
          />
          <StatCard
            label="New Members"
            value={formatNumber(data.today.newMembers)}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            }
          />
          <StatCard
            label="Page Views"
            value={formatNumber(data.today.pageViews)}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
          />
        </div>
      </div>

      {/* This Week Stats */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">This Week</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Revenue" value={formatCurrency(data.week.revenue)} />
          <StatCard label="Orders" value={formatNumber(data.week.orders)} />
          <StatCard label="New Members" value={formatNumber(data.week.newMembers)} />
          <StatCard label="Member Savings" value={formatCurrency(data.week.memberSavings)} />
        </div>
      </div>

      {/* Detailed Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products Overview */}
        <Card title="Products">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Products</span>
              <span className="text-sm font-medium">{formatNumber(data.products.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active</span>
              <span className="text-sm font-medium">{formatNumber(data.products.active)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Low Stock</span>
              <span className="text-sm font-medium">
                {data.products.lowStock > 0 ? (
                  <Badge variant="warning">{data.products.lowStock}</Badge>
                ) : (
                  '0'
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Out of Stock</span>
              <span className="text-sm font-medium">
                {data.products.outOfStock > 0 ? (
                  <Badge variant="error">{data.products.outOfStock}</Badge>
                ) : (
                  '0'
                )}
              </span>
            </div>
          </div>
        </Card>

        {/* Members Overview */}
        <Card title="Members">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Members</span>
              <span className="text-sm font-medium">{formatNumber(data.members.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active (30 days)</span>
              <span className="text-sm font-medium">{formatNumber(data.members.active)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Avg Lifetime Value</span>
              <span className="text-sm font-medium">{formatCurrency(data.members.avgLifetimeValue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Monthly Churn</span>
              <span className="text-sm font-medium">
                {data.month.churnedMembers > 0 ? (
                  <Badge variant="warning">{data.month.churnedMembers}</Badge>
                ) : (
                  <Badge variant="success">0</Badge>
                )}
              </span>
            </div>
          </div>
        </Card>

        {/* Price Intelligence Overview */}
        <Card title="Price Intelligence">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Products Tracked</span>
              <span className="text-sm font-medium">{formatNumber(data.prices.tracked)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Avg Savings vs Amazon</span>
              <span className="text-sm font-medium text-green-600">
                {data.prices.avgSavings.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Need Refresh</span>
              <span className="text-sm font-medium">
                {data.prices.staleCount > 0 ? (
                  <Badge variant="warning">{data.prices.staleCount}</Badge>
                ) : (
                  <Badge variant="success">All current</Badge>
                )}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm">
            Sync Shopify Products
          </Button>
          <Button variant="outline" size="sm">
            Refresh Prices
          </Button>
          <Button variant="outline" size="sm">
            Generate Weekly Report
          </Button>
          <Button variant="outline" size="sm">
            View Low Stock
          </Button>
        </div>
      </Card>
    </div>
  );
}
