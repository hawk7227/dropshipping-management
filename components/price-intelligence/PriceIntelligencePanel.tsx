'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, StatCard, Table, Badge, Button, Spinner, ErrorAlert, Pagination, Tabs, Modal, Input, Select, FileUpload, Alert, ProgressBar } from '@/components/ui';

interface CompetitorPrice {
  id: string;
  product_id: string;
  product_title: string;
  source: string;
  source_url: string;
  competitor_price: number;
  our_price: number;
  cost_price?: number; // Your cost/wholesale price
  profit_amount?: number; // our_price - cost_price
  profit_percent?: number; // ((our_price - cost_price) / cost_price) * 100
  savings_percent: number; // vs competitor (for customers)
  last_checked: string;
  // Availability fields
  availability_status?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  stock_quantity?: number;
  previous_price?: number;
  price_changed?: boolean;
  price_change_percent?: number;
  price_change_direction?: 'up' | 'down' | 'none';
  availability_changed?: boolean;
  previous_availability?: string;
}

interface PriceStats {
  tracked: number;
  avgSavings: number; // Average savings vs competitors (for customers)
  avgProfit: number; // Average profit margin (for you!)
  profitableCount: number; // Products making money
  losingCount: number; // Products LOSING money
  staleCount: number;
  // Availability stats
  outOfStockCount?: number;
  lowStockCount?: number;
  priceDropCount?: number;
  priceIncreaseCount?: number;
}

interface SyncJob {
  id: string;
  status: string;
  total_products: number;
  products_synced: number;
  source: string;
  started_at: string;
  completed_at: string | null;
}

interface PriceAlert {
  id: string;
  product_id: string;
  product_title: string;
  alert_type: 'price_drop' | 'price_increase' | 'back_in_stock' | 'out_of_stock' | 'low_stock';
  old_value: string;
  new_value: string;
  change_percent?: number;
  created_at: string;
  acknowledged: boolean;
}

interface PriceHistoryPoint {
  date: string;
  price: number;
  availability: string;
}

interface MonitoringRule {
  id: string;
  product_id?: string;
  rule_type: 'price_drop' | 'price_increase' | 'availability_change' | 'competitor_undercut';
  threshold_percent?: number;
  notify_email: boolean;
  notify_webhook: boolean;
  webhook_url?: string;
  enabled: boolean;
}

// File import interfaces
interface ImportPreview {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
}

interface ImportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalProducts: number;
  processedProducts: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; message: string }>;
}

// Destination channels for import
const IMPORT_DESTINATIONS = [
  { value: 'competitor_prices', label: 'Competitor Price Tracking' },
  { value: 'shopify', label: 'Shopify Store' },
  { value: 'ebay', label: 'eBay Listings' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'amazon', label: 'Amazon Seller' },
  { value: 'google_merchant', label: 'Google Merchant' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getAvailabilityColor(status: string | undefined): string {
  switch (status) {
    case 'in_stock': return 'success';
    case 'low_stock': return 'warning';
    case 'out_of_stock': return 'danger';
    default: return 'neutral';
  }
}

function getAvailabilityLabel(status: string | undefined): string {
  switch (status) {
    case 'in_stock': return 'In Stock';
    case 'low_stock': return 'Low Stock';
    case 'out_of_stock': return 'Out of Stock';
    default: return 'Unknown';
  }
}

export function PriceIntelligencePanel() {
  const [prices, setPrices] = useState<CompetitorPrice[]>([]);
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState('all');
  
  // New state for enhanced features
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [unacknowledgedAlerts, setUnacknowledgedAlerts] = useState(0);
  const [monitoringRules, setMonitoringRules] = useState<MonitoringRule[]>([]);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CompetitorPrice | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterAvailability, setFilterAvailability] = useState<string>('all');
  const [filterPriceChange, setFilterPriceChange] = useState<string>('all');
  
  // New rule form state
  const [newRule, setNewRule] = useState<Partial<MonitoringRule>>({
    rule_type: 'price_drop',
    threshold_percent: 5,
    notify_email: true,
    notify_webhook: false,
    enabled: true,
  });

  // File import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileType, setImportFileType] = useState<'csv' | 'json' | 'xlsx' | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importDestination, setImportDestination] = useState('competitor_prices');
  const [importLoading, setImportLoading] = useState(false);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'mapping' | 'progress'>('upload');
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
    fetchAlerts();
    fetchMonitoringRules();
  }, [page, activeTab, filterAvailability, filterPriceChange]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Build query params based on active tab and filters
      let priceAction = 'prices';
      let extraParams = '';
      
      if (activeTab === 'stale') {
        priceAction = 'stale';
        extraParams = '&hours=24&limit=50';
      } else if (activeTab === 'outofstock') {
        extraParams = '&availability=out_of_stock';
      } else if (activeTab === 'lowstock') {
        extraParams = '&availability=low_stock';
      } else if (activeTab === 'pricechanges') {
        extraParams = '&priceChanged=true';
      } else if (activeTab === 'profitable') {
        extraParams = '&profitStatus=profitable';
      } else if (activeTab === 'losing') {
        extraParams = '&profitStatus=losing';
      }
      
      if (filterAvailability !== 'all') {
        extraParams += `&availability=${filterAvailability}`;
      }
      if (filterPriceChange !== 'all') {
        extraParams += `&priceChange=${filterPriceChange}`;
      }

      // Fetch prices, stats, and sync status in parallel
      const [pricesRes, statsRes, syncRes] = await Promise.all([
        fetch(`/api/prices?action=${priceAction}&page=${page}&pageSize=20${extraParams}`),
        fetch('/api/prices?action=stats'),
        fetch('/api/prices?action=sync-status'),
      ]);

      if (!pricesRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch price data');
      }

      const pricesData = await pricesRes.json();
      const statsData = await statsRes.json();
      const syncData = await syncRes.json();

      setPrices(pricesData.data || []);
      setTotalPages(pricesData.totalPages || 1);
      setStats(statsData.data);
      setSyncJob(syncData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/prices?action=alerts&limit=50');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.data || []);
        setUnacknowledgedAlerts(
          (data.data || []).filter((a: PriceAlert) => !a.acknowledged).length
        );
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  }

  async function fetchMonitoringRules() {
    try {
      const res = await fetch('/api/prices?action=monitoring-rules');
      if (res.ok) {
        const data = await res.json();
        setMonitoringRules(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch monitoring rules:', err);
    }
  }

  async function fetchPriceHistory(productId: string) {
    try {
      setHistoryLoading(true);
      const res = await fetch(`/api/prices?action=history&productId=${productId}&days=90`);
      if (res.ok) {
        const data = await res.json();
        setPriceHistory(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch price history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function acknowledgeAlert(alertId: string) {
    try {
      await fetch('/api/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge-alert', alertId }),
      });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }

  async function acknowledgeAllAlerts() {
    try {
      await fetch('/api/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge-all-alerts' }),
      });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alerts:', err);
    }
  }

  async function saveMonitoringRule() {
    try {
      await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-monitoring-rule', rule: newRule }),
      });
      setShowRulesModal(false);
      setNewRule({
        rule_type: 'price_drop',
        threshold_percent: 5,
        notify_email: true,
        notify_webhook: false,
        enabled: true,
      });
      fetchMonitoringRules();
    } catch (err) {
      console.error('Failed to save monitoring rule:', err);
    }
  }

  async function deleteMonitoringRule(ruleId: string) {
    try {
      await fetch('/api/prices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-monitoring-rule', ruleId }),
      });
      fetchMonitoringRules();
    } catch (err) {
      console.error('Failed to delete monitoring rule:', err);
    }
  }

  async function toggleRuleEnabled(ruleId: string, enabled: boolean) {
    try {
      await fetch('/api/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-monitoring-rule', ruleId, enabled }),
      });
      fetchMonitoringRules();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  }

  function openHistory(product: CompetitorPrice) {
    setSelectedProduct(product);
    setShowHistoryModal(true);
    fetchPriceHistory(product.product_id);
  }

  // ==================
  // FILE IMPORT FUNCTIONS
  // ==================

  async function handleFileUpload(files: File[]) {
    const file = files[0];
    if (!file) return;

    setImportFile(file);
    setImportError(null);

    // Determine file type
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      setImportFileType('csv');
    } else if (ext === 'json') {
      setImportFileType('json');
    } else if (ext === 'xlsx' || ext === 'xls') {
      setImportFileType('xlsx');
    } else {
      setImportError('Unsupported file type. Please upload CSV, JSON, or Excel files.');
      return;
    }

    // Parse file for preview
    await parseImportFile(file, ext as 'csv' | 'json' | 'xlsx');
  }

  async function parseImportFile(file: File, type: 'csv' | 'json' | 'xlsx') {
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const res = await fetch('/api/prices?action=parse-import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to parse file');
      }

      const data = await res.json();
      setImportPreview(data.preview);
      
      // Auto-map common fields
      autoMapImportFields(data.preview.headers);
      
      setImportStep('preview');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setImportLoading(false);
    }
  }

  function autoMapImportFields(headers: string[]) {
    const mappings: Record<string, string> = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[_\s-]+/g, ''));
    
    // Common field mappings for competitor prices
    const fieldMap: Record<string, string[]> = {
      'sku': ['sku', 'productsku', 'itemsku', 'productid', 'id'],
      'title': ['title', 'name', 'productname', 'producttitle', 'itemname'],
      'competitor_price': ['price', 'competitorprice', 'amazonprice', 'marketprice', 'listprice'],
      'source': ['source', 'competitor', 'marketplace', 'store'],
      'source_url': ['url', 'sourceurl', 'producturl', 'link', 'amazonurl'],
      'availability': ['availability', 'stock', 'instock', 'stockstatus', 'availabilitystatus'],
      'stock_quantity': ['quantity', 'stockquantity', 'qty', 'inventory'],
    };

    Object.entries(fieldMap).forEach(([target, aliases]) => {
      const matchIdx = normalizedHeaders.findIndex(h => aliases.includes(h));
      if (matchIdx !== -1) {
        mappings[target] = headers[matchIdx];
      }
    });

    setFieldMappings(mappings);
  }

  async function startImport() {
    if (!importFile || !importPreview) return;

    setImportLoading(true);
    setImportError(null);
    setImportStep('progress');

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('fileType', importFileType || 'csv');
      formData.append('destination', importDestination);
      formData.append('mappings', JSON.stringify(fieldMappings));

      const res = await fetch('/api/prices?action=start-import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to start import');
      }

      const data = await res.json();
      setImportJob(data.job);

      // Poll for progress
      pollImportProgress(data.job.id);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to start import');
      setImportStep('preview');
    } finally {
      setImportLoading(false);
    }
  }

  async function pollImportProgress(jobId: string) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/prices?action=import-status&jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setImportJob(data.job);

          if (data.job.status === 'processing') {
            setTimeout(poll, 1000);
          } else if (data.job.status === 'completed') {
            // Refresh data after import
            fetchData();
          }
        }
      } catch (err) {
        console.error('Failed to poll import status:', err);
      }
    };

    poll();
  }

  function resetImport() {
    setImportFile(null);
    setImportFileType(null);
    setImportPreview(null);
    setImportJob(null);
    setImportError(null);
    setImportStep('upload');
    setFieldMappings({});
  }

  async function downloadTemplate(format: 'csv' | 'xlsx') {
    try {
      const res = await fetch(`/api/prices?action=download-template&format=${format}&type=${importDestination}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `price-import-template.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download template:', err);
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);

      // Get stale products first
      const staleRes = await fetch('/api/prices?action=stale&hours=24&limit=50');
      const staleData = await staleRes.json();

      if (!staleData.data || staleData.data.length === 0) {
        setError('No products need syncing');
        return;
      }

      const productIds = staleData.data.map((p: any) => p.product_id);

      // Start sync
      const syncRes = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', productIds, source: 'manual' }),
      });

      if (!syncRes.ok) throw new Error('Failed to start sync');

      // Refresh data after short delay
      setTimeout(fetchData, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const tabs = [
    { id: 'all', label: 'All Products' },
    { id: 'profitable', label: '✅ Profitable', count: stats?.profitableCount },
    { id: 'losing', label: '⚠️ Losing Money', count: stats?.losingCount },
    { id: 'outofstock', label: 'Out of Stock', count: stats?.outOfStockCount },
    { id: 'lowstock', label: 'Low Stock', count: stats?.lowStockCount },
    { id: 'pricechanges', label: 'Price Changes', count: (stats?.priceDropCount || 0) + (stats?.priceIncreaseCount || 0) },
  ];

  const priceColumns = [
    {
      key: 'product_title',
      header: 'Product',
      render: (item: CompetitorPrice) => (
        <div>
          <div className="font-medium text-gray-900 truncate max-w-xs">{item.product_title}</div>
          <div className="text-xs text-gray-500">{item.source}</div>
        </div>
      ),
    },
    {
      key: 'availability',
      header: 'Availability',
      render: (item: CompetitorPrice) => (
        <div className="flex flex-col gap-1">
          <Badge variant={getAvailabilityColor(item.availability_status) as any}>
            {getAvailabilityLabel(item.availability_status)}
          </Badge>
          {item.stock_quantity !== undefined && item.stock_quantity > 0 && (
            <span className="text-xs text-gray-500">{item.stock_quantity} units</span>
          )}
          {item.availability_changed && (
            <span className="text-xs text-orange-600 font-medium">Changed!</span>
          )}
        </div>
      ),
    },
    {
      key: 'competitor_price',
      header: 'Amazon Price',
      render: (item: CompetitorPrice) => (
        <div className="flex flex-col">
          <span className="text-gray-600">{formatCurrency(item.competitor_price)}</span>
          {item.price_changed && item.previous_price && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-400 line-through">{formatCurrency(item.previous_price)}</span>
              <span className={item.price_change_direction === 'down' ? 'text-green-600' : 'text-red-600'}>
                {item.price_change_direction === 'down' ? '↓' : '↑'}
                {item.price_change_percent?.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'our_price',
      header: 'Our Price',
      render: (item: CompetitorPrice) => (
        <span className="font-medium">{formatCurrency(item.our_price)}</span>
      ),
    },
    {
      key: 'profit',
      header: 'Profit/Loss',
      render: (item: CompetitorPrice) => {
        // Calculate profit if we have cost data
        const costPrice = item.cost_price || (item.our_price * 0.6); // Default 40% margin if no cost
        const profitAmount = item.our_price - costPrice;
        const profitPercent = costPrice > 0 ? ((profitAmount / costPrice) * 100) : 0;
        
        const isProfit = profitPercent > 0;
        const isLoss = profitPercent < 0;
        
        return (
          <div className="flex flex-col">
            <Badge variant={isProfit ? 'success' : isLoss ? 'danger' : 'neutral'}>
              {isProfit ? '+' : ''}{profitPercent.toFixed(1)}%
            </Badge>
            <span className={`text-xs mt-1 ${isProfit ? 'text-green-600' : isLoss ? 'text-red-600' : 'text-gray-500'}`}>
              {isProfit ? '+' : ''}{formatCurrency(profitAmount)}
            </span>
            {item.cost_price && (
              <span className="text-xs text-gray-400">
                Cost: {formatCurrency(item.cost_price)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'last_checked',
      header: 'Last Updated',
      render: (item: CompetitorPrice) => (
        <span className="text-sm text-gray-500">{formatRelativeTime(item.last_checked)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item: CompetitorPrice) => (
        <div className="flex gap-2">
          <button
            onClick={() => openHistory(item)}
            className="text-gray-400 hover:text-gray-600"
            title="View History"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600"
            title="View on Amazon"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      ),
    },
  ];

  if (loading) {
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <StatCard
          label="Products Tracked"
          value={stats?.tracked.toLocaleString() || '0'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <StatCard
          label="Avg Profit"
          value={`${(stats?.avgProfit || 35).toFixed(1)}%`}
          variant={(stats?.avgProfit || 35) > 0 ? 'success' : 'danger'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Profitable"
          value={stats?.profitableCount?.toLocaleString() || '0'}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Losing Money"
          value={stats?.losingCount?.toLocaleString() || '0'}
          variant="danger"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          label="Out of Stock"
          value={stats?.outOfStockCount?.toLocaleString() || '0'}
          variant="danger"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatCard
          label="Low Stock"
          value={stats?.lowStockCount?.toLocaleString() || '0'}
          variant="warning"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          label="Price Drops"
          value={stats?.priceDropCount?.toLocaleString() || '0'}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          }
        />
        <StatCard
          label="Price Increases"
          value={stats?.priceIncreaseCount?.toLocaleString() || '0'}
          variant="warning"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
      </div>

      {/* Alerts Banner */}
      {unacknowledgedAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-full">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-amber-800">
                  {unacknowledgedAlerts} new alert{unacknowledgedAlerts > 1 ? 's' : ''}
                </p>
                <p className="text-sm text-amber-600">
                  Price changes and availability updates detected
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAlerts(true)}>
                View Alerts
              </Button>
              <Button size="sm" variant="ghost" onClick={acknowledgeAllAlerts}>
                Dismiss All
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Status */}
      {syncJob && syncJob.status === 'running' && (
        <Card>
          <div className="flex items-center gap-4">
            <Spinner size="sm" />
            <div className="flex-1">
              <div className="text-sm font-medium">Sync in progress</div>
              <div className="text-xs text-gray-500">
                {syncJob.products_synced} of {syncJob.total_products} products
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Started {formatDate(syncJob.started_at)}
            </div>
          </div>
        </Card>
      )}

      {/* Price Table */}
      <Card
        title="Competitor Prices & Availability"
        action={
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowImportModal(true)} 
              variant="ghost" 
              size="sm"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import Data
            </Button>
            <Button 
              onClick={() => setShowRulesModal(true)} 
              variant="ghost" 
              size="sm"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Monitoring Rules
            </Button>
            <Button onClick={handleSync} loading={syncing} size="sm">
              Refresh Prices
            </Button>
          </div>
        }
      >
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Availability:</label>
            <select
              value={filterAvailability}
              onChange={(e) => setFilterAvailability(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">All</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Price Change:</label>
            <select
              value={filterPriceChange}
              onChange={(e) => setFilterPriceChange(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">All</option>
              <option value="drop">Price Drops</option>
              <option value="increase">Price Increases</option>
              <option value="changed">Any Change</option>
            </select>
          </div>
        </div>

        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="mt-4">
          <Table
            columns={priceColumns}
            data={prices}
            keyField="id"
            loading={loading}
            emptyMessage="No price data available"
          />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </Card>

      {/* Alerts Modal */}
      {showAlerts && (
        <Modal title="Price & Availability Alerts" onClose={() => setShowAlerts(false)} size="lg">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No alerts</p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.acknowledged ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            alert.alert_type === 'price_drop' ? 'success' :
                            alert.alert_type === 'back_in_stock' ? 'success' :
                            alert.alert_type === 'out_of_stock' ? 'danger' :
                            alert.alert_type === 'low_stock' ? 'warning' :
                            'warning'
                          }
                        >
                          {alert.alert_type.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                        {!alert.acknowledged && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                      <p className="font-medium mt-1">{alert.product_title}</p>
                      <p className="text-sm text-gray-600">
                        {alert.old_value} → {alert.new_value}
                        {alert.change_percent && ` (${alert.change_percent > 0 ? '+' : ''}${alert.change_percent.toFixed(1)}%)`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(alert.created_at)}</p>
                    </div>
                    {!alert.acknowledged && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* Monitoring Rules Modal */}
      {showRulesModal && (
        <Modal title="Monitoring Rules" onClose={() => setShowRulesModal(false)} size="lg">
          <div className="space-y-6">
            {/* Existing Rules */}
            <div>
              <h4 className="font-medium mb-3">Active Rules</h4>
              {monitoringRules.length === 0 ? (
                <p className="text-gray-500 text-sm">No monitoring rules configured</p>
              ) : (
                <div className="space-y-2">
                  {monitoringRules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => toggleRuleEnabled(rule.id, e.target.checked)}
                          className="rounded"
                        />
                        <div>
                          <p className="font-medium text-sm">
                            {rule.rule_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            {rule.threshold_percent && ` (>${rule.threshold_percent}%)`}
                          </p>
                          <p className="text-xs text-gray-500">
                            {rule.notify_email && 'Email'} {rule.notify_webhook && 'Webhook'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteMonitoringRule(rule.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* New Rule Form */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Add New Rule</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Rule Type</label>
                  <select
                    value={newRule.rule_type}
                    onChange={(e) => setNewRule({ ...newRule, rule_type: e.target.value as any })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="price_drop">Price Drop</option>
                    <option value="price_increase">Price Increase</option>
                    <option value="availability_change">Availability Change</option>
                    <option value="competitor_undercut">Competitor Undercut</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Threshold %</label>
                  <input
                    type="number"
                    value={newRule.threshold_percent || ''}
                    onChange={(e) => setNewRule({ ...newRule, threshold_percent: parseInt(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., 5"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newRule.notify_email}
                      onChange={(e) => setNewRule({ ...newRule, notify_email: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm">Email</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newRule.notify_webhook}
                      onChange={(e) => setNewRule({ ...newRule, notify_webhook: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm">Webhook</span>
                  </label>
                </div>
                {newRule.notify_webhook && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Webhook URL</label>
                    <input
                      type="url"
                      value={newRule.webhook_url || ''}
                      onChange={(e) => setNewRule({ ...newRule, webhook_url: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="https://..."
                    />
                  </div>
                )}
              </div>
              <Button onClick={saveMonitoringRule} className="mt-4">
                Add Rule
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Price History Modal */}
      {showHistoryModal && selectedProduct && (
        <Modal 
          title={`Price History: ${selectedProduct.product_title}`} 
          onClose={() => { setShowHistoryModal(false); setSelectedProduct(null); }} 
          size="lg"
        >
          {historyLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Price Chart Placeholder - would need a chart library */}
              <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border">
                <div className="text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p>Price trend over 90 days</p>
                  <p className="text-sm">
                    {priceHistory.length > 0 
                      ? `${priceHistory.length} data points` 
                      : 'No history data'
                    }
                  </p>
                </div>
              </div>

              {/* History Table */}
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Price</th>
                      <th className="text-left p-2">Availability</th>
                      <th className="text-left p-2">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((point, idx) => {
                      const prevPoint = priceHistory[idx + 1];
                      const priceChange = prevPoint 
                        ? ((point.price - prevPoint.price) / prevPoint.price * 100).toFixed(1)
                        : null;
                      return (
                        <tr key={point.date} className="border-b">
                          <td className="p-2">{new Date(point.date).toLocaleDateString()}</td>
                          <td className="p-2 font-medium">{formatCurrency(point.price)}</td>
                          <td className="p-2">
                            <Badge variant={getAvailabilityColor(point.availability) as any} size="sm">
                              {getAvailabilityLabel(point.availability)}
                            </Badge>
                          </td>
                          <td className="p-2">
                            {priceChange && (
                              <span className={parseFloat(priceChange) < 0 ? 'text-green-600' : parseFloat(priceChange) > 0 ? 'text-red-600' : 'text-gray-400'}>
                                {parseFloat(priceChange) > 0 ? '+' : ''}{priceChange}%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Import Data Modal */}
      {showImportModal && (
        <Modal 
          title="Import Price & Availability Data" 
          onClose={() => { setShowImportModal(false); resetImport(); }} 
          size="lg"
        >
          <div className="space-y-6">
            {importError && (
              <Alert type="error" message={importError} onDismiss={() => setImportError(null)} />
            )}

            {/* Step 1: Upload */}
            {importStep === 'upload' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Import Destination
                  </label>
                  <select
                    value={importDestination}
                    onChange={(e) => setImportDestination(e.target.value)}
                    className="w-full border rounded-md px-3 py-2"
                  >
                    {IMPORT_DESTINATIONS.map(dest => (
                      <option key={dest.value} value={dest.value}>{dest.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Choose where to import the data
                  </p>
                </div>

                <FileUpload
                  onUpload={handleFileUpload}
                  accept=".csv,.json,.xlsx,.xls"
                  label="Upload Price Data File"
                  description="Supports CSV, JSON, and Excel files"
                  loading={importLoading}
                />

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => downloadTemplate('csv')}>
                    Download CSV Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadTemplate('xlsx')}>
                    Download Excel Template
                  </Button>
                </div>

                <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                  <p className="font-medium mb-2">Required columns:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-500">
                    <li><strong>SKU</strong> - Product identifier to match</li>
                    <li><strong>Price</strong> - Competitor price</li>
                    <li><strong>Source</strong> - Where the price is from (e.g., Amazon, Walmart)</li>
                  </ul>
                  <p className="font-medium mt-3 mb-2">Optional columns:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-500">
                    <li><strong>Availability</strong> - in_stock, out_of_stock, low_stock</li>
                    <li><strong>Stock Quantity</strong> - Number of units available</li>
                    <li><strong>URL</strong> - Link to the product page</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Step 2: Preview & Mapping */}
            {importStep === 'preview' && importPreview && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{importFile?.name}</p>
                    <p className="text-sm text-gray-500">
                      {importPreview.totalRows} rows found
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={resetImport}>
                    Change File
                  </Button>
                </div>

                {/* Preview Table */}
                <div>
                  <h4 className="font-medium text-sm mb-2">Data Preview (first 5 rows)</h4>
                  <div className="overflow-x-auto max-h-40 border rounded">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {importPreview.headers.map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left font-medium text-gray-600">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {importPreview.rows.slice(0, 5).map((row, idx) => (
                          <tr key={idx}>
                            {importPreview.headers.map((h, colIdx) => (
                              <td key={colIdx} className="px-2 py-1.5 truncate max-w-[150px]">
                                {row[h]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Field Mapping */}
                <div>
                  <h4 className="font-medium text-sm mb-2">Field Mapping</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {['sku', 'competitor_price', 'source', 'source_url', 'availability', 'stock_quantity'].map(field => (
                      <div key={field} className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 w-28 capitalize">
                          {field.replace(/_/g, ' ')}:
                        </label>
                        <select
                          value={fieldMappings[field] || ''}
                          onChange={(e) => setFieldMappings({ ...fieldMappings, [field]: e.target.value })}
                          className="flex-1 border rounded px-2 py-1 text-sm"
                        >
                          <option value="">-- Not Mapped --</option>
                          {importPreview.headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button variant="outline" onClick={resetImport}>
                    Back
                  </Button>
                  <Button 
                    onClick={startImport} 
                    loading={importLoading}
                    disabled={!fieldMappings.sku || !fieldMappings.competitor_price}
                  >
                    Start Import to {IMPORT_DESTINATIONS.find(d => d.value === importDestination)?.label}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Progress */}
            {importStep === 'progress' && importJob && (
              <div className="space-y-6">
                <div className="text-center py-4">
                  {importJob.status === 'processing' ? (
                    <>
                      <Spinner size="lg" />
                      <p className="mt-4 font-medium">Importing data...</p>
                    </>
                  ) : importJob.status === 'completed' ? (
                    <div className="text-green-600">
                      <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="mt-4 font-medium">Import Complete!</p>
                    </div>
                  ) : (
                    <div className="text-red-600">
                      <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="mt-4 font-medium">Import Failed</p>
                    </div>
                  )}
                </div>

                <ProgressBar
                  value={importJob.processedProducts}
                  max={importJob.totalProducts}
                  label={`${importJob.processedProducts} of ${importJob.totalProducts} rows`}
                />

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xl font-semibold">{importJob.totalProducts}</p>
                    <p className="text-xs text-gray-500">Total Rows</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-xl font-semibold text-green-600">{importJob.successCount}</p>
                    <p className="text-xs text-gray-500">Successful</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-xl font-semibold text-red-600">{importJob.errorCount}</p>
                    <p className="text-xs text-gray-500">Failed</p>
                  </div>
                </div>

                {importJob.errors && importJob.errors.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm text-red-600 mb-2">
                      Errors ({importJob.errors.length})
                    </h4>
                    <div className="max-h-32 overflow-y-auto border border-red-200 rounded divide-y">
                      {importJob.errors.slice(0, 10).map((err, idx) => (
                        <div key={idx} className="p-2 text-sm text-red-700 bg-red-50">
                          Row {err.row}: {err.message}
                        </div>
                      ))}
                      {importJob.errors.length > 10 && (
                        <div className="p-2 text-sm text-gray-500 text-center">
                          ... and {importJob.errors.length - 10} more errors
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(importJob.status === 'completed' || importJob.status === 'failed') && (
                  <div className="flex gap-3 pt-4 border-t">
                    <Button onClick={() => { setShowImportModal(false); resetImport(); }}>
                      Close
                    </Button>
                    <Button variant="outline" onClick={resetImport}>
                      Import More Data
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
