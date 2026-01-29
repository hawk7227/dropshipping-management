'use client';

// components/ai/AICommandCenterFull.tsx
// Enhanced AI Command Center with natural language command processing

import React, { useState, useEffect } from 'react';

interface CommandInterpretation {
  action: string;
  category: string;
  description: string;
  target_count?: number;
  estimated_duration?: string;
  parameters: Record<string, any>;
}

interface CommandExecution {
  execution_id: string;
  command: string;
  interpretation: CommandInterpretation;
  status: 'planned' | 'executing' | 'completed' | 'failed';
  results?: {
    success_count: number;
    error_count: number;
    affected_items: string[];
    errors: Array<{ item: string; error: string }>;
  };
  executed_at?: string;
  error?: string;
}

export default function AICommandCenterFull() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [currentStep, setCurrentStep] = useState<'input' | 'interpret' | 'review' | 'execute' | 'results'>('input');
  const [interpretation, setInterpretation] = useState<CommandInterpretation | null>(null);
  const [execution, setExecution] = useState<CommandExecution | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [examples, setExamples] = useState<any[]>([]);

  // Fetch examples on mount
  useEffect(() => {
    const fetchExamples = async () => {
      try {
        const res = await fetch('/api/ai-commander/full?action=examples');
        const data = await res.json();
        setExamples(data.examples || []);
      } catch (error) {
        console.error('Error fetching examples:', error);
      }
    };

    fetchExamples();
  }, []);

  // Fetch history and stats
  const refreshHistory = async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        fetch('/api/ai-commander/full?action=history&limit=10'),
        fetch('/api/ai-commander/full?action=stats'),
      ]);

      const historyData = await historyRes.json();
      const statsData = await statsRes.json();

      setHistory(historyData.data || []);
      setStats(statsData.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    refreshHistory();
  }, []);

  // Step 1: Interpret command
  const handleInterpret = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ai-commander/full?action=interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: prompt }),
      });

      const data = await res.json();
      setInterpretation(data.interpretation);
      setCurrentStep('review');
    } catch (error) {
      console.error('Error interpreting command:', error);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Execute command
  const handleExecute = async () => {
    setLoading(true);
    try {
      const endpoint = dryRun ? 'execute' : 'execute-confirm';
      const res = await fetch(`/api/ai-commander/full?action=${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: prompt, dryRun }),
      });

      const data = await res.json();
      setExecution(data.execution);
      setCurrentStep('results');
      refreshHistory();
    } catch (error) {
      console.error('Error executing command:', error);
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setPrompt('');
    setCurrentStep('input');
    setInterpretation(null);
    setExecution(null);
  };

  // Use example command
  const useExample = (example: any) => {
    setPrompt(example.command);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">🤖 AI Command Center</h2>
        <p className="text-gray-600">
          Use natural language to control your dropshipping operations. Update prices, generate content, manage products, and more.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Command Interface */}
        <div className="lg:col-span-2 space-y-6">
          {/* Input Stage */}
          {currentStep === 'input' && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What do you want to do?
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., Update all product prices to be 15% cheaper than Amazon"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    rows={4}
                  />
                </div>

                <button
                  onClick={handleInterpret}
                  disabled={!prompt.trim() || loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  {loading ? 'Analyzing...' : 'Analyze Command'}
                </button>
              </div>

              {/* Examples */}
              {examples.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-sm font-medium text-gray-700 mb-3">Quick Examples:</p>
                  <div className="space-y-2">
                    {examples.slice(0, 4).map((example: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => useExample(example)}
                        className="block w-full text-left text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 p-2 rounded transition-colors"
                      >
                        • {example.command}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Review Stage */}
          {currentStep === 'review' && interpretation && (
            <div className="bg-white p-6 rounded-lg border border-blue-200 shadow-sm space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-medium text-gray-900 mb-2">Command Interpretation</h3>
                <p className="text-sm text-gray-700 mb-4">{interpretation.description}</p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Category:</span>
                    <p className="font-medium text-gray-900 capitalize">{interpretation.category}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Action:</span>
                    <p className="font-medium text-gray-900 capitalize">{interpretation.action.replace(/_/g, ' ')}</p>
                  </div>
                  {interpretation.target_count && (
                    <div>
                      <span className="text-gray-600">Target Items:</span>
                      <p className="font-medium text-gray-900">~{interpretation.target_count}</p>
                    </div>
                  )}
                  {interpretation.estimated_duration && (
                    <div>
                      <span className="text-gray-600">Estimated Time:</span>
                      <p className="font-medium text-gray-900">{interpretation.estimated_duration}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dry Run Toggle */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="w-4 h-4 text-purple-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Dry run (preview changes, don't execute)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep('input')}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  {loading ? 'Executing...' : `${dryRun ? 'Preview' : 'Execute'} Changes`}
                </button>
              </div>
            </div>
          )}

          {/* Results Stage */}
          {currentStep === 'results' && execution && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
              {/* Status */}
              <div className={`p-4 rounded-lg ${
                execution.status === 'completed' 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <h3 className="font-medium text-gray-900 mb-2">
                  {execution.status === 'completed' ? '✅ Execution Complete' : '❌ Execution Failed'}
                </h3>
                {execution.error && (
                  <p className="text-sm text-red-700">{execution.error}</p>
                )}
              </div>

              {/* Results Summary */}
              {execution.results && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Results Summary</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-600">Successful</p>
                      <p className="text-2xl font-bold text-green-600">{execution.results.success_count}</p>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-600">Failed</p>
                      <p className="text-2xl font-bold text-red-600">{execution.results.error_count}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-600">Total</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {execution.results.success_count + execution.results.error_count}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Errors (if any) */}
              {execution.results?.errors && execution.results.errors.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Errors</h3>
                  <div className="bg-red-50 p-3 rounded-lg text-sm text-red-700 max-h-32 overflow-y-auto">
                    {execution.results.errors.slice(0, 5).map((err, i) => (
                      <p key={i} className="mb-1">{err.item}: {err.error}</p>
                    ))}
                    {execution.results.errors.length > 5 && (
                      <p className="text-red-600 font-medium">... and {execution.results.errors.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                >
                  Run Another Command
                </button>
                {dryRun && (
                  <button
                    onClick={() => {
                      setDryRun(false);
                      handleExecute();
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Execute for Real
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Stats & History */}
        <div className="space-y-6">
          {/* Command Stats */}
          {stats && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-4">📊 Command Stats</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Commands:</span>
                  <span className="font-medium text-gray-900">{stats.total_commands}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Successful:</span>
                  <span className="font-medium text-green-600">{stats.successful}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Failed:</span>
                  <span className="font-medium text-red-600">{stats.failed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Items Affected:</span>
                  <span className="font-medium text-blue-600">{stats.total_items_affected}</span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Commands */}
          {history.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-4">📜 Recent Commands</h3>
              <div className="space-y-2">
                {history.slice(0, 5).map((log: any, i: number) => (
                  <div key={i} className="text-xs p-2 bg-gray-50 rounded border border-gray-200">
                    <p className="font-medium text-gray-900 truncate">{log.command}</p>
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-600 capitalize">{log.interpretation.category}</span>
                      {log.executed ? (
                        <span className="text-green-600">✓ Executed</span>
                      ) : (
                        <span className="text-yellow-600">Preview</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
