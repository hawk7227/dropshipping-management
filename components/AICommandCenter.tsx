'use client';

// components/ai/AICommandCenter.tsx
// Natural language AI command interface for store operations

import React, { useState } from 'react';

interface ActionPlan {
  action: string;
  details: string;
  affectedItems?: number;
  estimatedTime?: string;
}

interface CommandResult {
  success: boolean;
  message: string;
  plan?: ActionPlan[];
  executed?: boolean;
  results?: any;
}

export function AICommandCenter() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [history, setHistory] = useState<{ prompt: string; timestamp: string; success: boolean }[]>([]);

  const exampleCommands = [
    "Update all product prices to be 15% cheaper than Amazon",
    "Generate AI descriptions for products missing them",
    "Post the top 5 best sellers to Instagram",
    "Send abandoned cart emails to customers from last 24 hours",
    "Sync all products to Google Shopping with optimized titles",
    "Find new products with 80%+ profit margin",
  ];

  const handleExecute = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/ai-commander', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          dryRun,
        }),
      });

      const data = await res.json();
      setResult(data);

      // Add to history
      setHistory(prev => [
        { prompt, timestamp: new Date().toISOString(), success: data.success },
        ...prev.slice(0, 9), // Keep last 10
      ]);

      if (!dryRun && data.success) {
        setPrompt('');
      }
    } catch (error) {
      setResult({
        success: false,
        message: `Error: ${error}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmExecute = async () => {
    if (!result?.plan) return;

    setLoading(true);

    try {
      const res = await fetch('/api/ai-commander', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          dryRun: false,
          confirm: true,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: `Execution error: ${error}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Command Input */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-xl">🧠</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold">AI Command Center</h2>
            <p className="text-purple-100 text-sm">Execute store operations using natural language</p>
          </div>
        </div>

        <div className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Tell me what you want to do... e.g., 'Update all prices to be 10% cheaper than Amazon'"
            className="w-full h-24 px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 resize-none"
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-white/30"
              />
              <span>Preview only (dry run)</span>
            </label>

            <button
              onClick={handleExecute}
              disabled={loading || !prompt.trim()}
              className="px-6 py-2 bg-white text-purple-600 rounded-lg font-medium hover:bg-purple-50 disabled:opacity-50 transition-colors"
            >
              {loading ? '🔄 Processing...' : dryRun ? '👁️ Preview' : '⚡ Execute'}
            </button>
          </div>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-6 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{result.success ? '✅' : '❌'}</span>
              <h3 className={`font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.success ? 'Plan Ready' : 'Error'}
              </h3>
            </div>
            {result.success && dryRun && result.plan && (
              <button
                onClick={handleConfirmExecute}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Executing...' : '✓ Confirm & Execute'}
              </button>
            )}
          </div>

          <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.message}
          </p>

          {result.plan && result.plan.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-500 font-medium uppercase">Action Plan</p>
              {result.plan.map((action, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-white/50 rounded-lg">
                  <span className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-medium">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{action.action}</p>
                    <p className="text-xs text-gray-500">{action.details}</p>
                    {action.affectedItems && (
                      <p className="text-xs text-purple-600">Affects {action.affectedItems} items</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.executed && result.results && (
            <div className="mt-4 p-3 bg-white/50 rounded-lg">
              <p className="text-xs text-gray-500 font-medium uppercase mb-2">Execution Results</p>
              <pre className="text-xs text-gray-700 overflow-x-auto">
                {JSON.stringify(result.results, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Example Commands */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Example Commands</h3>
        <div className="grid grid-cols-2 gap-2">
          {exampleCommands.map((cmd, i) => (
            <button
              key={i}
              onClick={() => setPrompt(cmd)}
              className="text-left p-3 text-sm text-gray-700 bg-gray-50 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Recent Commands</h3>
          <div className="space-y-2">
            {history.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 text-sm hover:bg-gray-50 rounded cursor-pointer"
                onClick={() => setPrompt(item.prompt)}
              >
                <span className="text-gray-700 truncate flex-1">{item.prompt}</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.success ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-xs text-gray-400">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AICommandCenter;
