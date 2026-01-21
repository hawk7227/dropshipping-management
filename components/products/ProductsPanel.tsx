'use client';

import React, { useState, useEffect } from 'react';
import { Card, StatCard, Table, Badge, Button, Spinner, ErrorAlert, Pagination, Tabs, Input, Select } from '@/components/ui';

interface Product {
  id: string;
  shopify_product_id: string;
  title: string;
  vendor: string;
  product_type: string;
  status: 'active' | 'draft' | 'archived';
  retail_price: number;
  member_price: number;
  inventory_quantity: number;
  created_at: string;
  updated_at: string;
}

interface ProductStats {
  total: number;
  active: number;
  draft: number;
  archived: number;
  lowStock: number;
  outOfStock: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function ProductsPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchData();
  }, [page, statusFilter]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        action: 'list',
        page: String(page),
        pageSize: '20',
      });
      if (statusFilter) params.append('status', statusFilter);
      if (search) params.append('search', search);

      const [productsRes, statsRes] = await Promise.all([
        fetch(`/api/products?${params}`),
        fetch('/api/products?action=stats'),
      ]);

      if (!productsRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch products');
      }

      const productsData = await productsRes.json();
      const statsData = await statsRes.json();

      setProducts(productsData.data || []);
      setTotalPages(productsData.totalPages || 1);
      setStats(statsData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  async function handleShopifySync() {
    try {
      setSyncing(true);
      setError(null);

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-shopify', fullSync: false }),
      });

      if (!res.ok) throw new Error('Sync failed');

      const data = await res.json();
      
      // Refresh data
      fetchData();
      
      alert(`Sync complete: ${data.data.synced} products synced`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchData();
  }

  const tabs = [
    { id: 'all', label: 'All Products', count: stats?.total },
    { id: 'active', label: 'Active', count: stats?.active },
    { id: 'draft', label: 'Draft', count: stats?.draft },
    { id: 'low-stock', label: 'Low Stock', count: stats?.lowStock },
  ];

  const productColumns = [
    {
      key: 'title',
      header: 'Product',
      render: (item: Product) => (
        <div>
          <div className="font-medium text-gray-900 truncate max-w-xs">{item.title}</div>
          <div className="text-xs text-gray-500">{item.vendor} | {item.product_type}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Product) => (
        <Badge variant={item.status === 'active' ? 'success' : item.status === 'draft' ? 'warning' : 'default'}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'retail_price',
      header: 'Retail Price',
      render: (item: Product) => (
        <span className="text-gray-600">{formatCurrency(item.retail_price)}</span>
      ),
    },
    {
      key: 'member_price',
      header: 'Member Price',
      render: (item: Product) => (
        <span className="font-medium text-green-600">{formatCurrency(item.member_price)}</span>
      ),
    },
    {
      key: 'inventory_quantity',
      header: 'Stock',
      render: (item: Product) => (
        <span className={`font-medium ${
          item.inventory_quantity <= 0 ? 'text-red-600' : 
          item.inventory_quantity < 10 ? 'text-yellow-600' : 'text-gray-900'
        }`}>
          {item.inventory_quantity}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item: Product) => (
        <Button variant="outline" size="sm">
          Edit
        </Button>
      ),
    },
  ];

  if (loading && products.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="Total Products" value={stats?.total.toLocaleString() || '0'} />
        <StatCard label="Active" value={stats?.active.toLocaleString() || '0'} />
        <StatCard label="Draft" value={stats?.draft.toLocaleString() || '0'} />
        <StatCard label="Archived" value={stats?.archived.toLocaleString() || '0'} />
        <StatCard label="Low Stock" value={stats?.lowStock.toLocaleString() || '0'} />
        <StatCard label="Out of Stock" value={stats?.outOfStock.toLocaleString() || '0'} />
      </div>

      {/* Products Table */}
      <Card
        title="Products"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShopifySync} loading={syncing}>
              Sync Shopify
            </Button>
            <Button size="sm">
              Add Product
            </Button>
          </div>
        }
      >
        {/* Search and Filters */}
        <div className="mb-4 flex gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'active', label: 'Active' },
              { value: 'draft', label: 'Draft' },
              { value: 'archived', label: 'Archived' },
            ]}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>

        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (tab === 'all') setStatusFilter('');
            else if (tab === 'active') setStatusFilter('active');
            else if (tab === 'draft') setStatusFilter('draft');
            setPage(1);
          }}
        />

        <div className="mt-4">
          <Table
            columns={productColumns}
            data={products}
            keyField="id"
            loading={loading}
            emptyMessage="No products found"
          />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </Card>
    </div>
  );
}
