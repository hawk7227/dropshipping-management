'use client';

// components/products/CronTestPanel.tsx
// ═══════════════════════════════════════════════════════════════════════════
// CRON TEST PANEL — Spec Items 22, 23, 24
// Test Now buttons for every cron job + API key validation
// ═══════════════════════════════════════════════════════════════════════════
// - Auto Sourcing, Price Sync, Shopify Sync, Stale Check, Demand Check
// - Google Shopping test
// - API Keys tab: Keepa, Rainforest, Shopify — with response time
// - All tests call /api/cron/test?job=X (no CRON_SECRET check)
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type TestableJob =
  | 'product-discovery'
  | 'price-sync'
  | 'shopify-sync'
  | 'stale-check'
  | 'demand-check'
  | 'google-shopping'
  | 'api-keys';

interface TestResult {
  job: string;
  success: boolean;
  message: string;
  duration_ms: number;
  details?: Record<string, unknown>;
  api_results?: ApiKeyResult[];
}

interface ApiKeyResult {
  name: string;
  valid: boolean;
  response_ms: number;
  error?: string;
}

interface JobState {
  status: 'idle' | 'running' | 'success' | 'error';
  result: TestResult | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  Play: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  RefreshCw: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Check: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Key: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// JOB DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const CRON_JOBS: {
  id: TestableJob;
  label: string;
  description: string;
  schedule: string;
}[] = [
  {
    id: 'product-discovery',
    label: 'Auto Sourcing',
    description: 'Rainforest search → criteria filter → Keepa demand → import',
    schedule: 'Daily 4AM',
  },
  {
    id: 'price-sync',
    label: 'Price Sync',
    description: 'Check current Amazon prices via Keepa, update cost + margins',
    schedule: 'Every hour',
  },
  {
    id: 'shopify-sync',
    label: 'Shopify Sync',
    description: 'Push products + prices + metafields to Shopify store',
    schedule: 'Every 6 hours',
  },
  {
    id: 'stale-check',
    label: 'Stale Check',
    description: 'Flag products not price-checked in 14+ days',
    schedule: 'Daily 3AM',
  },
  {
    id: 'demand-check',
    label: 'Demand Check',
    description: 'Recalculate BSR/velocity/demand scores via Keepa',
    schedule: 'Daily 2AM',
  },
  {
    id: 'google-shopping',
    label: 'Google Shopping',
    description: 'Optimize titles, generate feed XML, update GMC metafields',
    schedule: 'Daily 5AM',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function CronTestPanel() {
  const [jobStates, setJobStates] = useState<Record<string, JobState>>({});

  const runTest = async (jobId: TestableJob) => {
    // Set running
    setJobStates(prev => ({
      ...prev,
      [jobId]: { status: 'running', result: null },
    }));

    try {
      const res = await fetch(`/api/cron/test?job=${jobId}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setJobStates(prev => ({
          ...prev,
          [jobId]: { status: 'success', result: data },
        }));
      } else {
        setJobStates(prev => ({
          ...prev,
          [jobId]: {
            status: 'error',
            result: {
              job: jobId,
              success: false,
              message: data.error || data.message || 'Test failed',
              duration_ms: data.duration_ms || 0,
              details: data.details,
            },
          },
        }));
      }
    } catch (err) {
      setJobStates(prev => ({
        ...prev,
        [jobId]: {
          status: 'error',
          result: {
            job: jobId,
            success: false,
            message: err instanceof Error ? err.message : 'Network error',
            duration_ms: 0,
          },
        },
      }));
    }
  };

  const runAllTests = async () => {
    // Run all sequentially to avoid hammering APIs
    for (const job of [...CRON_JOBS, { id: 'api-keys' as TestableJob }]) {
      await runTest(job.id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Test Now — Cron Jobs &amp; API Keys</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Run limited-scope tests for each automated feature. No auth required.
          </p>
        </div>
        <button
          onClick={runAllTests}
          aria-label="Run all cron job tests"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Icons.Play className="w-3.5 h-3.5" />
          Run All Tests
        </button>
      </div>

      {/* Cron Job Tests */}
      <div className="space-y-2">
        {CRON_JOBS.map((job) => (
          <JobTestRow
            key={job.id}
            jobId={job.id}
            label={job.label}
            description={job.description}
            schedule={job.schedule}
            state={jobStates[job.id] || { status: 'idle', result: null }}
            onRun={() => runTest(job.id)}
          />
        ))}
      </div>

      {/* API Keys Section */}
      <div className="border-t border-gray-200 pt-4">
        <ApiKeyTestRow
          state={jobStates['api-keys'] || { status: 'idle', result: null }}
          onRun={() => runTest('api-keys')}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB TEST ROW
// ═══════════════════════════════════════════════════════════════════════════

function JobTestRow({ jobId, label, description, schedule, state, onRun }: {
  jobId: string;
  label: string;
  description: string;
  schedule: string;
  state: JobState;
  onRun: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Main row */}
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <StatusDot status={state.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{label}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">{schedule}</span>
            </div>
            <p className="text-xs text-gray-500 truncate">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          {/* Duration badge */}
          {state.result && (
            <span className="text-xs text-gray-400 font-mono tabular-nums">
              {state.result.duration_ms < 1000
                ? `${state.result.duration_ms}ms`
                : `${(state.result.duration_ms / 1000).toFixed(1)}s`
              }
            </span>
          )}

          {/* Result badge */}
          {state.status === 'success' && (
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full hover:bg-green-100 transition-colors">
              <Icons.Check className="w-3 h-3" /> Pass
            </button>
          )}
          {state.status === 'error' && (
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full hover:bg-red-100 transition-colors">
              <Icons.X className="w-3 h-3" /> Fail
            </button>
          )}

          {/* Run button */}
          <button
            onClick={onRun}
            disabled={state.status === 'running'}
            aria-label={`Test ${job.label}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              state.status === 'running'
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm'
            }`}
          >
            {state.status === 'running' ? (
              <>
                <Icons.RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Icons.Play className="w-3.5 h-3.5" />
                Test Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && state.result && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs">
          <p className={`font-medium ${state.result.success ? 'text-green-800' : 'text-red-800'}`}>
            {state.result.message}
          </p>
          {state.result.details && Object.keys(state.result.details).length > 0 && (
            <pre className="mt-2 p-2 bg-white border border-gray-200 rounded text-gray-600 overflow-x-auto max-h-40">
              {JSON.stringify(state.result.details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY TEST ROW (Item 24)
// ═══════════════════════════════════════════════════════════════════════════

function ApiKeyTestRow({ state, onRun }: {
  state: JobState;
  onRun: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <div className="flex items-center gap-3">
          <Icons.Key className="w-4 h-4 text-gray-500" />
          <div>
            <span className="text-sm font-medium text-gray-900">API Key Validation</span>
            <p className="text-xs text-gray-500">Test Keepa, Rainforest, and Shopify API keys with response time</p>
          </div>
        </div>
        <button
          onClick={onRun}
          disabled={state.status === 'running'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            state.status === 'running'
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm'
          }`}
        >
          {state.status === 'running' ? (
            <>
              <Icons.RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Icons.Key className="w-3.5 h-3.5" />
              Test All Keys
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {state.result?.api_results && state.result.api_results.length > 0 && (
        <div className="border-t border-gray-100">
          {state.result.api_results.map((key, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-b-0">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${key.valid ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-800 font-medium">{key.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-gray-400 tabular-nums">{key.response_ms}ms</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  key.valid
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {key.valid ? 'Valid' : key.error || 'Invalid'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state when the whole test fails */}
      {state.status === 'error' && !state.result?.api_results && state.result && (
        <div className="px-4 py-3 border-t border-gray-100 bg-red-50 text-xs text-red-800">
          {state.result.message}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS DOT
// ═══════════════════════════════════════════════════════════════════════════

function StatusDot({ status }: { status: JobState['status'] }) {
  const styles: Record<JobState['status'], string> = {
    idle: 'bg-gray-300',
    running: 'bg-blue-500 animate-pulse',
    success: 'bg-green-500',
    error: 'bg-red-500',
  };
  return <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${styles[status]}`} />;
}

export default CronTestPanel;
