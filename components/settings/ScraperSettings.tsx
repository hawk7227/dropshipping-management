'use client';

// components/settings/ScraperSettings.tsx
// Batch scraper control panel for Settings page
// Features: Start/Stop/Pause, Progress monitoring, File upload

import React, { useState, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface BatchJob {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  totalAsins: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  currentBatch: number;
  totalBatches: number;
  avgProcessingTimeMs: number;
  consecutiveFailures: number;
  circuitBreakerTripped: boolean;
  todayCount: number;
  startedAt: string | null;
  lastActivityAt: string;
}

interface ScraperHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'stopped';
  metrics: {
    successRate: number;
    avgResponseTimeMs: number;
    requestsLastHour: number;
    requestsToday: number;
    estimatedTimeRemaining: string | null;
    circuitBreakerStatus: 'closed' | 'open';
  };
  warnings: string[];
  errors: string[];
}

interface ScraperConfig {
  minDelayMs: number;
  maxDelayMs: number;
  batchSize: number;
  maxPerHour: number;
  maxPerDay: number;
  safeHoursStart: number;
  safeHoursEnd: number;
  enforceSafeHours: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ScraperSettings() {
  const [job, setJob] = useState<BatchJob | null>(null);
  const [health, setHealth] = useState<ScraperHealth | null>(null);
  const [config, setConfig] = useState<ScraperConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  
  // File upload state
  const [uploadedAsins, setUploadedAsins] = useState<string[]>([]);
  const [textAsins, setTextAsins] = useState('');
  const [preloadedAsins, setPreloadedAsins] = useState<string[]>([]);

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH STATUS
  // ─────────────────────────────────────────────────────────────────────────
  
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper');
      if (!res.ok) {
        // API not deployed yet - that's ok, just show the form
        setLoading(false);
        return;
      }
      const data = await res.json();
      
      if (data.success) {
        setJob(data.job);
        setHealth(data.health);
        setConfig(data.config);
        setError(null);
      }
    } catch (e) {
      // API not available - still show the form, just without status
      console.log('[Scraper] API not available yet');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for updates when job is running
  useEffect(() => {
    fetchStatus();
    
    const interval = setInterval(() => {
      if (job?.status === 'running' || job?.status === 'paused') {
        fetchStatus();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [fetchStatus, job?.status]);

  // Load preloaded ASINs
  useEffect(() => {
    fetch('/api/scraper/preloaded')
      .then(res => res.json())
      .then(data => {
        if (data.asins && data.asins.length > 0) {
          setPreloadedAsins(data.asins);
          console.log(`[Scraper] Loaded ${data.asins.length} preloaded ASINs`);
        }
      })
      .catch((err) => {
        console.log('[Scraper] No preloaded ASINs available:', err);
      });
  }, []);

  // Calculate total ASINs available
  const totalAsinsAvailable = uploadedAsins.length + 
    textAsins.split(/[\n,\s]+/).filter(a => a.trim() && /^B[0-9A-Z]{9}$/i.test(a.trim())).length +
    (uploadedAsins.length === 0 && !textAsins.trim() ? preloadedAsins.length : 0);

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  
  const handleAction = async (action: 'start' | 'stop' | 'pause' | 'resume', asins?: string[]) => {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    
    try {
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, asins }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setJob(data.job);
        setMessage(data.message);
      } else {
        setError(data.error || 'Action failed');
      }
    } catch (e) {
      setError('Failed to execute action');
    } finally {
      setActionLoading(false);
      fetchStatus();
    }
  };

  const handleStart = () => {
    // Combine all ASIN sources
    const allAsins = [
      ...uploadedAsins,
      ...textAsins.split(/[\n,\s]+/).filter(a => a.trim()),
    ];
    
    if (allAsins.length === 0 && preloadedAsins.length > 0) {
      // Use preloaded if no new ones
      handleAction('start', preloadedAsins);
    } else if (allAsins.length > 0) {
      handleAction('start', allAsins);
    } else {
      setError('No ASINs to scrape. Upload a file or paste ASINs.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setActionLoading(true);
    
    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const asins = JSON.parse(text);
        setUploadedAsins(Array.isArray(asins) ? asins : []);
        setMessage(`Loaded ${asins.length} ASINs from JSON`);
      } else if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        const text = await file.text();
        const asins = text.split(/[\n,]+/).map(a => a.trim()).filter(a => /^B[0-9A-Z]{9}$/i.test(a));
        setUploadedAsins(asins);
        setMessage(`Loaded ${asins.length} ASINs from file`);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setError('Excel files must be converted to CSV or JSON first');
      }
    } catch (err) {
      setError('Failed to parse file');
    } finally {
      setActionLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600 bg-green-100';
      case 'paused': return 'text-yellow-600 bg-yellow-100';
      case 'completed': return 'text-blue-600 bg-blue-100';
      case 'failed': 
      case 'stopped': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const progressPercent = job && job.totalAsins > 0 
    ? Math.round((job.processedCount / job.totalAsins) * 100) 
    : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">🤖 Amazon Batch Scraper</h2>
            <p className="text-sm text-gray-500 mt-1">
              Safe automated scraping - runs 2-6 AM EST only
            </p>
          </div>
          {health && (
            <div className={`flex items-center gap-2 ${getHealthColor(health.status)}`}>
              <span className={`w-3 h-3 rounded-full ${
                health.status === 'healthy' ? 'bg-green-500' :
                health.status === 'degraded' ? 'bg-yellow-500' :
                health.status === 'critical' ? 'bg-red-500' : 'bg-gray-500'
              }`}></span>
              <span className="font-medium capitalize">{health.status}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            ✅ {message}
          </div>
        )}

        {/* Active Job Status */}
        {job && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}>
                  {job.status.toUpperCase()}
                </span>
                <span className="text-gray-600">Job: {job.id.substring(0, 20)}...</span>
              </div>
              <div className="flex gap-2">
                {job.status === 'running' && (
                  <button
                    onClick={() => handleAction('pause')}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
                  >
                    ⏸️ Pause
                  </button>
                )}
                {job.status === 'paused' && (
                  <button
                    onClick={() => handleAction('resume')}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    ▶️ Resume
                  </button>
                )}
                {(job.status === 'running' || job.status === 'paused') && (
                  <button
                    onClick={() => handleAction('stop')}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    ⏹️ Stop
                  </button>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress: {job.processedCount.toLocaleString()} / {job.totalAsins.toLocaleString()}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className={`h-4 rounded-full transition-all ${
                    job.status === 'running' ? 'bg-green-500' :
                    job.status === 'paused' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-white p-3 rounded-lg">
                <div className="text-gray-500">Success</div>
                <div className="text-xl font-semibold text-green-600">{job.successCount.toLocaleString()}</div>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <div className="text-gray-500">Failed</div>
                <div className="text-xl font-semibold text-red-600">{job.failedCount.toLocaleString()}</div>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <div className="text-gray-500">Skipped</div>
                <div className="text-xl font-semibold text-yellow-600">{job.skippedCount.toLocaleString()}</div>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <div className="text-gray-500">Today</div>
                <div className="text-xl font-semibold text-blue-600">{job.todayCount.toLocaleString()}</div>
              </div>
            </div>

            {/* Additional Info */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">Batch:</span> {job.currentBatch} / {job.totalBatches}
              </div>
              <div>
                <span className="font-medium">Avg Time:</span> {job.avgProcessingTimeMs}ms
              </div>
              <div>
                <span className="font-medium">Circuit Breaker:</span>{' '}
                <span className={job.circuitBreakerTripped ? 'text-red-600' : 'text-green-600'}>
                  {job.circuitBreakerTripped ? '⚠️ TRIPPED' : '✅ OK'}
                </span>
              </div>
            </div>

            {/* Estimated Time */}
            {health?.metrics.estimatedTimeRemaining && job.status === 'running' && (
              <div className="mt-4 text-center text-gray-600">
                ⏱️ Estimated time remaining: <strong>{health.metrics.estimatedTimeRemaining}</strong>
              </div>
            )}
          </div>
        )}

        {/* Start New Job Section */}
        {(!job || job.status === 'completed' || job.status === 'stopped' || job.status === 'failed') && (
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4">📦 Start New Scrape Job</h3>
            
            {/* Preloaded ASINs */}
            {preloadedAsins.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-blue-800">🗂️ Preloaded ASINs Ready:</span>
                    <span className="ml-2 text-blue-600">{preloadedAsins.length.toLocaleString()} ASINs</span>
                  </div>
                  <button
                    onClick={() => handleAction('start', preloadedAsins)}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    🚀 Start with Preloaded
                  </button>
                </div>
              </div>
            )}

            {/* File Upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload ASINs (JSON or CSV)
              </label>
              <input
                type="file"
                accept=".json,.csv,.txt"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {uploadedAsins.length > 0 && (
                <p className="mt-2 text-sm text-green-600">
                  ✅ {uploadedAsins.length.toLocaleString()} ASINs loaded from file
                </p>
              )}
            </div>

            {/* Text Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or paste ASINs (one per line or comma-separated)
              </label>
              <textarea
                value={textAsins}
                onChange={(e) => setTextAsins(e.target.value)}
                placeholder="B09V3KXJPB&#10;B08XYZ1234&#10;B07ABC5678"
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {textAsins && (
                <p className="mt-1 text-sm text-gray-500">
                  {textAsins.split(/[\n,\s]+/).filter(a => a.trim()).length} ASINs detected
                </p>
              )}
            </div>

            {/* Start Button */}
            <button
              onClick={handleStart}
              disabled={actionLoading || (uploadedAsins.length === 0 && !textAsins.trim() && preloadedAsins.length === 0)}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {actionLoading ? '⏳ Starting...' : '🚀 Start Batch Scrape'}
            </button>
          </div>
        )}

        {/* Configuration Info */}
        {config && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-semibold text-gray-900 mb-3">⚙️ Scraper Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Delay:</span>
                <div className="font-medium">{config.minDelayMs/1000}-{config.maxDelayMs/1000}s</div>
              </div>
              <div>
                <span className="text-gray-500">Batch Size:</span>
                <div className="font-medium">{config.batchSize}</div>
              </div>
              <div>
                <span className="text-gray-500">Max/Hour:</span>
                <div className="font-medium">{config.maxPerHour}</div>
              </div>
              <div>
                <span className="text-gray-500">Max/Day:</span>
                <div className="font-medium">{config.maxPerDay.toLocaleString()}</div>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">Safe Hours (EST):</span>
                <div className="font-medium">
                  {config.enforceSafeHours 
                    ? `${config.safeHoursStart}:00 AM - ${config.safeHoursEnd}:00 AM` 
                    : 'Disabled (anytime)'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Warnings */}
        {health?.warnings && health.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">⚠️ Warnings</h4>
            <ul className="list-disc list-inside text-sm text-yellow-700">
              {health.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Errors */}
        {health?.errors && health.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-800 mb-2">❌ Errors</h4>
            <ul className="list-disc list-inside text-sm text-red-700">
              {health.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
