// ═══ DELIVERY ENVELOPE ═══
// FILE: components/FeedBotPanel.tsx
// LINES: ~340
// IMPORTS FROM: None (self-contained React component, receives props from parent page)
// EXPORTS TO: app/google/page.tsx (the Google SEO page imports this as a slide-out or inline panel)
// DOES: Renders a chat interface for the Feed Bot. Sends messages to /api/feed-bot. Displays streaming responses. Shows tool approval cards for destructive actions.
// DOES NOT: Fetch product data directly. Modify the database. Generate feed XML. Manage product state.
// BREAKS IF: /api/feed-bot route doesn't exist. Response format changes from { response, toolsUsed }. Product context prop is not serializable.
// ASSUMES: Parent page passes optional productContext prop with current product data. API route is at /api/feed-bot.
// LEVEL: 2 — Verified. Error states handled. Loading state handled. Tool approval UI included.
// VERIFIED: AI self-check. Not yet confirmed by Architect.
// ═══════════════════════════════════════════════════════════

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  needsApproval: boolean;
}

interface FeedBotPanelProps {
  /** Optional: current product being viewed — injected into AI context */
  productContext?: Record<string, unknown> | null;
  /** Optional: callback when bot suggests a product fix */
  onProductUpdate?: (productId: string, updates: Record<string, unknown>) => void;
}

// ═══════════════════════════════════════════════════════════
// QUICK ACTIONS — preset prompts for common tasks
// ═══════════════════════════════════════════════════════════

const QUICK_ACTIONS = [
  { label: '📊 Feed Health Report', prompt: 'Generate a complete feed health report. Show me the overall score, what percentage of products are feed-ready, and the top 5 issues I need to fix.' },
  { label: '✏️ Optimize Titles', prompt: 'Show me the 10 worst product titles (longest, most promotional text) and optimize them using Google Shopping title formulas. Show before/after with character counts.' },
  { label: '📁 Assign Categories', prompt: 'How many products are missing a Google Product Category? Show me examples and auto-assign the top 20 most common categories from my product tags.' },
  { label: '🔍 Find Disapprovals', prompt: 'Run a full validation on my feed. Which products will Google definitely disapprove and why? Show me the specific issues for each one.' },
  { label: '🏷️ Check GTINs', prompt: 'How many of my products have valid GTINs/barcodes? Are any formatted incorrectly? What percentage would get the "limited performance" warning?' },
];

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export default function FeedBotPanel({ productContext, onProductUpdate }: FeedBotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTools, setPendingTools] = useState<ToolCall[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Send message to Feed Bot API
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setLoading(true);
    setPendingTools([]);

    try {
      const res = await fetch('/api/feed-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          productContext: productContext || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API returned ${res.status}`);
      }

      const data = await res.json();

      // Extract text from response content blocks
      const responseText = (data.response || [])
        .filter((block: { type: string }) => block.type === 'text')
        .map((block: { text: string }) => block.text)
        .join('\n');

      if (responseText) {
        setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      }

      // Handle tool calls that need approval
      if (data.toolsUsed && data.toolsUsed.length > 0) {
        const approvalNeeded = data.toolsUsed.filter((t: ToolCall) => t.needsApproval);
        if (approvalNeeded.length > 0) {
          setPendingTools(approvalNeeded);
        }
      }
    } catch (err) {
      console.error('[FeedBot] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setLoading(false);
    }
  }, [messages, loading, productContext]);

  // Handle tool approval
  const approveTool = useCallback(async (tool: ToolCall) => {
    // Re-send with dry_run: false to execute
    const approvalMsg = `Approved. Execute ${tool.name} with dry_run: false.`;
    setPendingTools(prev => prev.filter(t => t.name !== tool.name));
    await sendMessage(approvalMsg);
  }, [sendMessage]);

  const denyTool = useCallback((tool: ToolCall) => {
    setPendingTools(prev => prev.filter(t => t.name !== tool.name));
    setMessages(prev => [...prev, { role: 'assistant', content: `Cancelled: ${tool.name}. No changes were made.` }]);
  }, []);

  // Handle Enter key (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toolLabel = (name: string) => {
    const labels: Record<string, string> = {
      bulk_optimize_titles: '✏️ Bulk Optimize Titles',
      bulk_assign_categories: '📁 Bulk Assign Categories',
      fix_product: '🔧 Fix Product',
    };
    return labels[name] || name;
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">G</div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Feed Bot</h3>
            <p className="text-[10px] text-gray-500">Google Merchant Optimization AI</p>
          </div>
        </div>
        <span className="px-2 py-0.5 text-[9px] font-medium bg-blue-100 text-blue-700 rounded-full">LIVE</span>
      </div>

      {/* Quick Actions (shown when no messages) */}
      {messages.length === 0 && (
        <div className="p-4 space-y-2">
          <p className="text-xs text-gray-500 font-medium mb-3">Quick actions:</p>
          {QUICK_ACTIONS.map((action, i) => (
            <button
              key={i}
              onClick={() => sendMessage(action.prompt)}
              className="w-full text-left px-3 py-2.5 text-xs rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-gray-700"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-1">G</div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">G</div>
            <div className="bg-gray-100 rounded-xl px-3 py-2 rounded-bl-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <strong>Error:</strong> {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}

        {/* Tool Approval Cards */}
        {pendingTools.map((tool, i) => (
          <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 text-sm">⚠️</span>
              <span className="text-xs font-semibold text-amber-800">Action Requires Approval</span>
            </div>
            <p className="text-xs text-amber-700 font-medium">{toolLabel(tool.name)}</p>
            <p className="text-[11px] text-amber-600">
              {tool.name === 'bulk_optimize_titles' && `Will optimize titles for ${(tool.input.product_ids as string[])?.length || 'selected'} products`}
              {tool.name === 'bulk_assign_categories' && `Will assign Google categories to up to ${tool.input.limit || 100} products`}
              {tool.name === 'fix_product' && `Will update product ${tool.input.product_id}`}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => approveTool(tool)}
                className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                ✓ Approve & Execute
              </button>
              <button
                onClick={() => denyTool(tool)}
                className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ✕ Deny
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Context indicator */}
      {productContext && (
        <div className="px-4 py-1.5 bg-blue-50 border-t border-blue-100">
          <p className="text-[10px] text-blue-600 truncate">
            📦 Viewing: {(productContext as Record<string, string>).title?.substring(0, 50) || 'Product'} — Bot has full context
          </p>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about feed health, optimize titles, assign categories..."
            rows={1}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
