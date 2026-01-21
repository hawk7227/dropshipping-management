'use client';

// components/ai/AICommandCenter.tsx
// Natural language AI command center for full product control
// Add, edit, remove, update products and more via simple prompts

import React, { useState, useRef, useEffect } from 'react';
import { Card, Button, Spinner, Badge, Alert, Modal, Table } from '@/components/ui';

interface CommandResult {
  id: string;
  command: string;
  timestamp: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'needs_confirmation';
  action: {
    type: 'create' | 'update' | 'delete' | 'bulk_update' | 'search' | 'analyze' | 'generate' | 'sync';
    targets: number;
    details: string;
  };
  result?: {
    success: boolean;
    message: string;
    affected: number;
    data?: any[];
  };
  confirmationRequired?: {
    message: string;
    affectedProducts: any[];
    destructive: boolean;
  };
}

interface ParsedIntent {
  action: string;
  targets: string[];
  filters: Record<string, any>;
  values: Record<string, any>;
  confidence: number;
}

interface SuggestedCommand {
  text: string;
  description: string;
  category: string;
}

const COMMAND_SUGGESTIONS: SuggestedCommand[] = [
  // Product Management
  { text: 'Add 10 new products from this description...', description: 'Create multiple products', category: 'Create' },
  { text: 'Create a product called "Summer Hat" at $29.99', description: 'Create single product', category: 'Create' },
  { text: 'Duplicate all products from vendor "Nike"', description: 'Clone products', category: 'Create' },
  
  // Editing
  { text: 'Increase all prices by 10%', description: 'Bulk price adjustment', category: 'Edit' },
  { text: 'Set all products from "Brand X" to draft', description: 'Bulk status change', category: 'Edit' },
  { text: 'Update descriptions for all products tagged "sale"', description: 'Bulk description update', category: 'Edit' },
  { text: 'Add tag "clearance" to all products under $20', description: 'Bulk tag products', category: 'Edit' },
  { text: 'Set inventory to 0 for all out of stock items', description: 'Bulk inventory update', category: 'Edit' },
  { text: 'Change vendor from "Old Name" to "New Name"', description: 'Bulk vendor update', category: 'Edit' },
  
  // Deletion
  { text: 'Delete all products with 0 inventory', description: 'Remove out of stock', category: 'Delete' },
  { text: 'Remove all products not sold in 6 months', description: 'Clean stale products', category: 'Delete' },
  { text: 'Archive all draft products older than 30 days', description: 'Archive old drafts', category: 'Delete' },
  
  // AI Generation
  { text: 'Generate SEO descriptions for all products missing them', description: 'AI descriptions', category: 'AI' },
  { text: 'Create meta titles for products with poor SEO scores', description: 'AI SEO optimization', category: 'AI' },
  { text: 'Suggest pricing for new products based on competitors', description: 'AI pricing', category: 'AI' },
  { text: 'Analyze and fix all products with missing images', description: 'AI image analysis', category: 'AI' },
  
  // Search & Analysis
  { text: 'Find all products with margins below 20%', description: 'Margin analysis', category: 'Search' },
  { text: 'Show products that need price updates', description: 'Stale prices', category: 'Search' },
  { text: 'List bestsellers not in stock', description: 'Stock analysis', category: 'Search' },
  { text: 'Find duplicate SKUs', description: 'Data quality', category: 'Search' },
  
  // Sync
  { text: 'Sync all products to Shopify', description: 'Push to Shopify', category: 'Sync' },
  { text: 'Update eBay listings for changed products', description: 'Sync to eBay', category: 'Sync' },
  { text: 'Push new products to all channels', description: 'Multi-channel sync', category: 'Sync' },
];

const COMMAND_HISTORY_KEY = 'ai-command-history';

export function AICommandCenter() {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [commandHistory, setCommandHistory] = useState<CommandResult[]>([]);
  const [currentResult, setCurrentResult] = useState<CommandResult | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<SuggestedCommand[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Load command history
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COMMAND_HISTORY_KEY);
      if (saved) {
        setCommandHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load command history:', e);
    }
  }, []);

  // Save command history
  useEffect(() => {
    try {
      localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(commandHistory.slice(0, 50)));
    } catch (e) {
      console.error('Failed to save command history:', e);
    }
  }, [commandHistory]);

  // Filter suggestions based on input
  useEffect(() => {
    if (command.length > 0) {
      const lower = command.toLowerCase();
      const filtered = COMMAND_SUGGESTIONS.filter(s => 
        s.text.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.category.toLowerCase().includes(lower)
      );
      setFilteredSuggestions(filtered.slice(0, 6));
    } else if (selectedCategory) {
      setFilteredSuggestions(COMMAND_SUGGESTIONS.filter(s => s.category === selectedCategory));
    } else {
      setFilteredSuggestions([]);
    }
  }, [command, selectedCategory]);

  // Scroll to latest result
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [commandHistory]);

  async function executeCommand(commandText: string) {
    if (!commandText.trim()) return;
    
    setIsProcessing(true);
    setError(null);
    setShowSuggestions(false);

    const newResult: CommandResult = {
      id: Date.now().toString(),
      command: commandText,
      timestamp: new Date().toISOString(),
      status: 'processing',
      action: {
        type: 'search',
        targets: 0,
        details: 'Analyzing command...',
      },
    };

    setCurrentResult(newResult);
    setCommandHistory(prev => [...prev, newResult]);

    try {
      // Parse the command with AI
      const parseRes = await fetch('/api/ai?action=parse-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandText }),
      });

      if (!parseRes.ok) {
        throw new Error('Failed to parse command');
      }

      const parseData = await parseRes.json();
      const intent: ParsedIntent = parseData.intent;

      // Update with parsed intent
      const updatedResult: CommandResult = {
        ...newResult,
        action: {
          type: intent.action as any,
          targets: parseData.affectedCount || 0,
          details: parseData.description || 'Processing...',
        },
      };

      // Check if confirmation is needed (destructive operations)
      if (parseData.requiresConfirmation) {
        updatedResult.status = 'needs_confirmation';
        updatedResult.confirmationRequired = {
          message: parseData.confirmationMessage,
          affectedProducts: parseData.affectedProducts || [],
          destructive: parseData.destructive || false,
        };

        setCurrentResult(updatedResult);
        setPendingCommand(updatedResult);
        setShowConfirmation(true);
        updateHistoryItem(updatedResult);
        return;
      }

      // Execute the command
      const execRes = await fetch('/api/ai?action=execute-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          command: commandText,
          intent,
          confirmed: true,
        }),
      });

      if (!execRes.ok) {
        throw new Error('Failed to execute command');
      }

      const execData = await execRes.json();

      // Update with result
      const finalResult: CommandResult = {
        ...updatedResult,
        status: execData.success ? 'completed' : 'failed',
        result: {
          success: execData.success,
          message: execData.message,
          affected: execData.affected || 0,
          data: execData.data,
        },
      };

      setCurrentResult(finalResult);
      updateHistoryItem(finalResult);
      setCommand('');

    } catch (err) {
      const errorResult: CommandResult = {
        ...newResult,
        status: 'failed',
        result: {
          success: false,
          message: err instanceof Error ? err.message : 'Command failed',
          affected: 0,
        },
      };
      setCurrentResult(errorResult);
      updateHistoryItem(errorResult);
      setError(err instanceof Error ? err.message : 'Failed to execute command');
    } finally {
      setIsProcessing(false);
    }
  }

  async function confirmCommand() {
    if (!pendingCommand) return;

    setShowConfirmation(false);
    setIsProcessing(true);

    try {
      const execRes = await fetch('/api/ai?action=execute-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          command: pendingCommand.command,
          confirmed: true,
        }),
      });

      if (!execRes.ok) {
        throw new Error('Failed to execute command');
      }

      const execData = await execRes.json();

      const finalResult: CommandResult = {
        ...pendingCommand,
        status: execData.success ? 'completed' : 'failed',
        result: {
          success: execData.success,
          message: execData.message,
          affected: execData.affected || 0,
          data: execData.data,
        },
      };

      setCurrentResult(finalResult);
      updateHistoryItem(finalResult);
      setCommand('');
      setPendingCommand(null);

    } catch (err) {
      const errorResult: CommandResult = {
        ...pendingCommand,
        status: 'failed',
        result: {
          success: false,
          message: err instanceof Error ? err.message : 'Command failed',
          affected: 0,
        },
      };
      setCurrentResult(errorResult);
      updateHistoryItem(errorResult);
      setError(err instanceof Error ? err.message : 'Failed to execute command');
    } finally {
      setIsProcessing(false);
    }
  }

  function cancelCommand() {
    if (pendingCommand) {
      const cancelledResult: CommandResult = {
        ...pendingCommand,
        status: 'failed',
        result: {
          success: false,
          message: 'Command cancelled by user',
          affected: 0,
        },
      };
      updateHistoryItem(cancelledResult);
    }
    setShowConfirmation(false);
    setPendingCommand(null);
    setIsProcessing(false);
  }

  function updateHistoryItem(result: CommandResult) {
    setCommandHistory(prev => 
      prev.map(item => item.id === result.id ? result : item)
    );
  }

  function useSuggestion(suggestion: SuggestedCommand) {
    setCommand(suggestion.text);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function clearHistory() {
    setCommandHistory([]);
    localStorage.removeItem(COMMAND_HISTORY_KEY);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand(command);
    }
  }

  const categories = [...new Set(COMMAND_SUGGESTIONS.map(s => s.category))];

  return (
    <div className="space-y-6">
      {error && (
        <Alert type="error" message={error} onDismiss={() => setError(null)} />
      )}

      {/* Command Input */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI Command Center</h3>
              <p className="text-sm text-gray-500">Control your products with natural language</p>
            </div>
          </div>

          <div className="relative">
            <textarea
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Type a command... e.g., 'Increase all prices by 10%' or 'Delete products with 0 inventory'"
              className="w-full px-4 py-3 pr-24 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={2}
              disabled={isProcessing}
            />
            <Button
              onClick={() => executeCommand(command)}
              loading={isProcessing}
              disabled={!command.trim()}
              className="absolute right-2 bottom-2"
              size="sm"
            >
              Execute
            </Button>
          </div>

          {/* Category Quick Filters */}
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(selectedCategory === cat ? null : cat);
                  setShowSuggestions(true);
                }}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedCategory === cat
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && (filteredSuggestions.length > 0 || !command) && (
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {(filteredSuggestions.length > 0 ? filteredSuggestions : COMMAND_SUGGESTIONS.slice(0, 6)).map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => useSuggestion(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{suggestion.text}</p>
                      <p className="text-xs text-gray-500">{suggestion.description}</p>
                    </div>
                    <Badge variant="default" size="sm">{suggestion.category}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Command History */}
      <Card 
        title="Command History"
        action={
          commandHistory.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              Clear History
            </Button>
          )
        }
      >
        {commandHistory.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>No commands yet</p>
            <p className="text-sm">Start by typing a command above</p>
          </div>
        ) : (
          <div ref={historyRef} className="space-y-4 max-h-96 overflow-y-auto">
            {commandHistory.map((result) => (
              <div 
                key={result.id}
                className={`p-4 rounded-lg border ${
                  result.status === 'completed' ? 'bg-green-50 border-green-200' :
                  result.status === 'failed' ? 'bg-red-50 border-red-200' :
                  result.status === 'needs_confirmation' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant={
                          result.status === 'completed' ? 'success' :
                          result.status === 'failed' ? 'error' :
                          result.status === 'needs_confirmation' ? 'warning' :
                          'info'
                        }
                        size="sm"
                      >
                        {result.status === 'processing' ? 'Processing...' : result.status}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900 truncate">{result.command}</p>
                    <p className="text-sm text-gray-600 mt-1">{result.action.details}</p>
                    {result.result && (
                      <p className={`text-sm mt-2 ${result.result.success ? 'text-green-700' : 'text-red-700'}`}>
                        {result.result.message}
                        {result.result.affected > 0 && ` (${result.result.affected} products affected)`}
                      </p>
                    )}
                  </div>
                  {result.status === 'processing' && (
                    <Spinner size="sm" />
                  )}
                </div>

                {/* Show result data if available */}
                {result.result?.data && result.result.data.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">Results ({result.result.data.length} items)</p>
                    <div className="max-h-32 overflow-y-auto text-sm">
                      {result.result.data.slice(0, 5).map((item: any, idx: number) => (
                        <div key={idx} className="py-1 border-b border-gray-100 last:border-0">
                          {item.title || item.name || item.sku || JSON.stringify(item).slice(0, 100)}
                        </div>
                      ))}
                      {result.result.data.length > 5 && (
                        <p className="text-gray-400 py-1">... and {result.result.data.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Confirmation Modal */}
      {showConfirmation && pendingCommand?.confirmationRequired && (
        <Modal
          title={pendingCommand.confirmationRequired.destructive ? 'Confirm Destructive Action' : 'Confirm Action'}
          onClose={cancelCommand}
        >
          <div className="space-y-4">
            <Alert
              type={pendingCommand.confirmationRequired.destructive ? 'warning' : 'info'}
              message={pendingCommand.confirmationRequired.message}
            />

            <div className="text-sm">
              <p className="font-medium mb-2">Command:</p>
              <p className="p-3 bg-gray-100 rounded">{pendingCommand.command}</p>
            </div>

            {pendingCommand.confirmationRequired.affectedProducts.length > 0 && (
              <div>
                <p className="font-medium text-sm mb-2">
                  Affected Products ({pendingCommand.confirmationRequired.affectedProducts.length})
                </p>
                <div className="max-h-40 overflow-y-auto border rounded divide-y">
                  {pendingCommand.confirmationRequired.affectedProducts.slice(0, 10).map((product: any, idx: number) => (
                    <div key={idx} className="p-2 text-sm">
                      {product.title || product.sku || `Product ${idx + 1}`}
                    </div>
                  ))}
                  {pendingCommand.confirmationRequired.affectedProducts.length > 10 && (
                    <div className="p-2 text-sm text-gray-500">
                      ... and {pendingCommand.confirmationRequired.affectedProducts.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={cancelCommand} className="flex-1">
                Cancel
              </Button>
              <Button 
                variant={pendingCommand.confirmationRequired.destructive ? 'danger' : 'primary'}
                onClick={confirmCommand}
                loading={isProcessing}
                className="flex-1"
              >
                {pendingCommand.confirmationRequired.destructive ? 'Yes, Delete' : 'Confirm'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => executeCommand('Show all products with low inventory')}
            className="p-4 text-left border rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isProcessing}
          >
            <svg className="w-6 h-6 text-orange-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="font-medium text-sm">Low Inventory</p>
            <p className="text-xs text-gray-500">Find products running low</p>
          </button>

          <button
            onClick={() => executeCommand('Generate SEO descriptions for products missing them')}
            className="p-4 text-left border rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isProcessing}
          >
            <svg className="w-6 h-6 text-purple-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="font-medium text-sm">AI Descriptions</p>
            <p className="text-xs text-gray-500">Generate missing content</p>
          </button>

          <button
            onClick={() => executeCommand('Find products with margins below 20%')}
            className="p-4 text-left border rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isProcessing}
          >
            <svg className="w-6 h-6 text-green-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-sm">Low Margin</p>
            <p className="text-xs text-gray-500">Analyze profitability</p>
          </button>

          <button
            onClick={() => executeCommand('Sync all changed products to channels')}
            className="p-4 text-left border rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isProcessing}
          >
            <svg className="w-6 h-6 text-blue-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="font-medium text-sm">Sync Channels</p>
            <p className="text-xs text-gray-500">Push updates everywhere</p>
          </button>
        </div>
      </Card>
    </div>
  );
}
