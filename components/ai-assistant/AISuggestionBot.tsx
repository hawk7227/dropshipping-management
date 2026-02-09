'use client';

// components/ai-assistant/AISuggestionBot.tsx
// COMPLETE AI Suggestion Bot - Floating AI assistant widget with chat interface,
// smart suggestions, action execution, conversation history, and analytics

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  KeyboardEvent,
  FormEvent,
} from 'react';
import type {
  Product,
  AISuggestion,
  SuggestionType,
  SuggestionPriority,
  ApiResponse,
} from '@/types';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';
import { PRICING_RULES } from '@/lib/config/pricing-rules';
import { formatPrice, formatProfitPercent } from '@/lib/utils/pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

// Bot states
type BotState = 'minimized' | 'open' | 'expanded';

// View modes
type ViewMode = 'chat' | 'suggestions' | 'history' | 'settings';

// Message types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  suggestions?: AISuggestion[];
  actions?: SuggestionAction[];
  isLoading?: boolean;
  error?: ApiError;
}

// Suggestion action
interface SuggestionAction {
  id: string;
  label: string;
  type: 'apply' | 'dismiss' | 'snooze' | 'view_details' | 'custom';
  data?: Record<string, unknown>;
  isDestructive?: boolean;
}

// Enriched suggestion with UI state
interface EnrichedSuggestion extends AISuggestion {
  isExpanded: boolean;
  isApplying: boolean;
  isDismissed: boolean;
  snoozedUntil: string | null;
}

// Conversation history entry
interface ConversationEntry {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  timestamp: string;
  suggestions: AISuggestion[];
}

// Bot settings
interface BotSettings {
  autoSuggest: boolean;
  suggestFrequency: 'realtime' | 'hourly' | 'daily';
  priorityThreshold: SuggestionPriority;
  enabledTypes: SuggestionType[];
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

// Component props
interface AISuggestionBotProps {
  products: Product[];
  onApplySuggestion: (suggestion: AISuggestion) => Promise<void>;
  onProductAction: (action: string, productIds: string[]) => Promise<void>;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MARGIN_THRESHOLD = PRICING_RULES.profitThresholds.minimum;
const MAX_MESSAGES = 100;
const MAX_HISTORY = 50;
const TYPING_DELAY = 50;
const RESPONSE_DELAY = 1000;

const DEFAULT_SETTINGS: BotSettings = {
  autoSuggest: true,
  suggestFrequency: 'hourly',
  priorityThreshold: 'medium',
  enabledTypes: ['price_adjustment', 'margin_alert', 'stock_alert', 'trend_insight', 'action_required'],
  soundEnabled: false,
  notificationsEnabled: true,
};

const SUGGESTION_TYPE_CONFIG: Record<SuggestionType, { icon: string; color: string; label: string }> = {
  price_adjustment: { icon: '💰', color: 'blue', label: 'Price Adjustment' },
  margin_alert: { icon: '⚠️', color: 'yellow', label: 'Margin Alert' },
  stock_alert: { icon: '📦', color: 'orange', label: 'Stock Alert' },
  trend_insight: { icon: '📈', color: 'purple', label: 'Trend Insight' },
  action_required: { icon: '🔔', color: 'red', label: 'Action Required' },
};

const PRIORITY_CONFIG: Record<SuggestionPriority, { color: string; label: string }> = {
  critical: { color: 'red', label: 'Critical' },
  high: { color: 'orange', label: 'High' },
  medium: { color: 'yellow', label: 'Medium' },
  low: { color: 'gray', label: 'Low' },
};

const QUICK_ACTIONS = [
  { id: 'check_margins', label: 'Check low margins', icon: '📉' },
  { id: 'refresh_stale', label: 'Refresh stale prices', icon: '🔄' },
  { id: 'find_deals', label: 'Find new deals', icon: '🔍' },
  { id: 'analyze_trends', label: 'Analyze trends', icon: '📊' },
  { id: 'export_report', label: 'Export report', icon: '📄' },
];

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

type BotAction =
  | { type: 'SET_BOT_STATE'; payload: BotState }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_SUGGESTIONS'; payload: EnrichedSuggestion[] }
  | { type: 'UPDATE_SUGGESTION'; payload: { id: string; updates: Partial<EnrichedSuggestion> } }
  | { type: 'DISMISS_SUGGESTION'; payload: string }
  | { type: 'SNOOZE_SUGGESTION'; payload: { id: string; until: string } }
  | { type: 'SET_HISTORY'; payload: ConversationEntry[] }
  | { type: 'ADD_HISTORY_ENTRY'; payload: ConversationEntry }
  | { type: 'SET_SETTINGS'; payload: Partial<BotSettings> }
  | { type: 'SET_IS_TYPING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'SET_UNREAD_COUNT'; payload: number }
  | { type: 'INCREMENT_UNREAD' }
  | { type: 'CLEAR_UNREAD' };

interface BotReducerState {
  botState: BotState;
  viewMode: ViewMode;
  messages: ChatMessage[];
  suggestions: EnrichedSuggestion[];
  history: ConversationEntry[];
  settings: BotSettings;
  isTyping: boolean;
  error: ApiError | null;
  unreadCount: number;
}

const initialState: BotReducerState = {
  botState: 'minimized',
  viewMode: 'chat',
  messages: [],
  suggestions: [],
  history: [],
  settings: DEFAULT_SETTINGS,
  isTyping: false,
  error: null,
  unreadCount: 0,
};

function botReducer(state: BotReducerState, action: BotAction): BotReducerState {
  switch (action.type) {
    case 'SET_BOT_STATE':
      return { 
        ...state, 
        botState: action.payload,
        unreadCount: action.payload !== 'minimized' ? 0 : state.unreadCount,
      };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'ADD_MESSAGE': {
      const messages = [...state.messages, action.payload].slice(-MAX_MESSAGES);
      return { 
        ...state, 
        messages,
        unreadCount: state.botState === 'minimized' && action.payload.role === 'assistant'
          ? state.unreadCount + 1
          : state.unreadCount,
      };
    }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id ? { ...m, ...action.payload.updates } : m
        ),
      };

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    case 'SET_SUGGESTIONS':
      return { ...state, suggestions: action.payload };

    case 'UPDATE_SUGGESTION':
      return {
        ...state,
        suggestions: state.suggestions.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      };

    case 'DISMISS_SUGGESTION':
      return {
        ...state,
        suggestions: state.suggestions.map(s =>
          s.id === action.payload ? { ...s, isDismissed: true } : s
        ),
      };

    case 'SNOOZE_SUGGESTION':
      return {
        ...state,
        suggestions: state.suggestions.map(s =>
          s.id === action.payload.id ? { ...s, snoozedUntil: action.payload.until } : s
        ),
      };

    case 'SET_HISTORY':
      return { ...state, history: action.payload };

    case 'ADD_HISTORY_ENTRY': {
      const history = [action.payload, ...state.history].slice(0, MAX_HISTORY);
      return { ...state, history };
    }

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'SET_IS_TYPING':
      return { ...state, isTyping: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_UNREAD_COUNT':
      return { ...state, unreadCount: action.payload };

    case 'INCREMENT_UNREAD':
      return { ...state, unreadCount: state.unreadCount + 1 };

    case 'CLEAR_UNREAD':
      return { ...state, unreadCount: 0 };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Format relative time
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

/**
 * Generate AI suggestions based on products
 */
function generateSuggestions(products: Product[]): EnrichedSuggestion[] {
  const suggestions: EnrichedSuggestion[] = [];

  // Find low margin products
  const lowMarginProducts = products.filter(
    p => p.profit_margin !== null && p.profit_margin < MARGIN_THRESHOLD
  );
  if (lowMarginProducts.length > 0) {
    suggestions.push({
      id: generateId(),
      type: 'margin_alert',
      priority: lowMarginProducts.length > 5 ? 'critical' : 'high',
      title: `${lowMarginProducts.length} products below margin threshold`,
      description: `These products have profit margins below ${MARGIN_THRESHOLD}%. Consider adjusting prices or removing them.`,
      affectedProducts: lowMarginProducts.map(p => p.id),
      suggestedAction: 'review_pricing',
      potentialImpact: lowMarginProducts.length * 5,
      confidence: 0.95,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isExpanded: false,
      isApplying: false,
      isDismissed: false,
      snoozedUntil: null,
    });
  }

  // Find stale products
  const staleProducts = products.filter(p => {
    if (!p.last_price_check) return true;
    const daysSince = (Date.now() - new Date(p.last_price_check).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > PRICING_RULES.refresh.staleThresholdDays;
  });
  if (staleProducts.length > 0) {
    suggestions.push({
      id: generateId(),
      type: 'action_required',
      priority: staleProducts.length > 10 ? 'high' : 'medium',
      title: `${staleProducts.length} products need price refresh`,
      description: `These products haven't been price-checked recently and may have outdated pricing.`,
      affectedProducts: staleProducts.map(p => p.id),
      suggestedAction: 'refresh_prices',
      potentialImpact: staleProducts.length * 2,
      confidence: 0.9,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      isExpanded: false,
      isApplying: false,
      isDismissed: false,
      snoozedUntil: null,
    });
  }

  // Find trending products (mock)
  if (products.length > 10) {
    const trendingProducts = products.slice(0, 5);
    suggestions.push({
      id: generateId(),
      type: 'trend_insight',
      priority: 'medium',
      title: 'High-performing products identified',
      description: `${trendingProducts.length} products show strong sales potential based on price trends and competitor analysis.`,
      affectedProducts: trendingProducts.map(p => p.id),
      suggestedAction: 'increase_inventory',
      potentialImpact: 15,
      confidence: 0.75,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      isExpanded: false,
      isApplying: false,
      isDismissed: false,
      snoozedUntil: null,
    });
  }

  // Price adjustment opportunity
  const priceAdjustCandidates = products.filter(
    p => p.profit_margin !== null && p.profit_margin > MARGIN_THRESHOLD * 2.5
  );
  if (priceAdjustCandidates.length > 0) {
    suggestions.push({
      id: generateId(),
      type: 'price_adjustment',
      priority: 'low',
      title: `${priceAdjustCandidates.length} products could be more competitive`,
      description: `These products have high margins and could be priced more competitively to increase sales volume.`,
      affectedProducts: priceAdjustCandidates.map(p => p.id),
      suggestedAction: 'lower_prices',
      potentialImpact: priceAdjustCandidates.length * 3,
      confidence: 0.7,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      isExpanded: false,
      isApplying: false,
      isDismissed: false,
      snoozedUntil: null,
    });
  }

  return suggestions.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Generate AI response based on user input
 */
function generateAIResponse(
  input: string,
  products: Product[],
  suggestions: EnrichedSuggestion[]
): { content: string; suggestions?: AISuggestion[] } {
  const inputLower = input.toLowerCase();

  // Margin-related queries
  if (inputLower.includes('margin') || inputLower.includes('profit')) {
    const lowMargin = products.filter(p => (p.profit_margin ?? 0) < MARGIN_THRESHOLD);
    const avgMargin = products.reduce((sum, p) => sum + (p.profit_margin ?? 0), 0) / products.length;
    
    return {
      content: `📊 **Margin Analysis**\n\nYour average profit margin is **${avgMargin.toFixed(1)}%**.\n\n${
        lowMargin.length > 0
          ? `⚠️ **${lowMargin.length} products** are below the ${MARGIN_THRESHOLD}% threshold and need attention.`
          : '✅ All products are above the minimum margin threshold!'
      }\n\nWould you like me to show you the low-margin products or suggest price adjustments?`,
      suggestions: suggestions.filter(s => s.type === 'margin_alert'),
    };
  }

  // Stale/refresh queries
  if (inputLower.includes('stale') || inputLower.includes('refresh') || inputLower.includes('update')) {
    const stale = products.filter(p => {
      if (!p.last_price_check) return true;
      const days = (Date.now() - new Date(p.last_price_check).getTime()) / (1000 * 60 * 60 * 24);
      return days > PRICING_RULES.refresh.staleThresholdDays;
    });

    return {
      content: `🔄 **Price Freshness Report**\n\n${
        stale.length > 0
          ? `**${stale.length} products** need a price refresh (last checked over ${PRICING_RULES.refresh.staleThresholdDays} days ago).`
          : '✅ All products have recent price data!'
      }\n\nI can help you refresh prices for all stale products. Would you like me to do that?`,
      suggestions: suggestions.filter(s => s.type === 'action_required'),
    };
  }

  // Products/inventory queries
  if (inputLower.includes('product') || inputLower.includes('inventory') || inputLower.includes('how many')) {
    const active = products.filter(p => p.status === 'active').length;
    const paused = products.filter(p => p.status === 'paused').length;
    const synced = products.filter(p => p.shopify_id).length;

    return {
      content: `📦 **Inventory Overview**\n\n- **Total Products:** ${products.length}\n- **Active:** ${active}\n- **Paused:** ${paused}\n- **Synced to Shopify:** ${synced}\n\nWould you like a more detailed breakdown by category or margin status?`,
    };
  }

  // Deal/opportunity queries
  if (inputLower.includes('deal') || inputLower.includes('opportunity') || inputLower.includes('find')) {
    return {
      content: `🔍 **Finding Opportunities**\n\nBased on current market analysis, I can help you:\n\n1. **Discover new products** matching your criteria\n2. **Identify trending items** with growth potential\n3. **Find pricing gaps** in competitor offerings\n\nWhich would you like to explore?`,
      suggestions: suggestions.filter(s => s.type === 'trend_insight'),
    };
  }

  // Help queries
  if (inputLower.includes('help') || inputLower.includes('what can you')) {
    return {
      content: `👋 **I'm your AI Assistant!**\n\nI can help you with:\n\n📊 **Analytics** - Margin analysis, trend insights\n💰 **Pricing** - Price recommendations, competitor analysis\n🔄 **Operations** - Refresh prices, sync to Shopify\n🔔 **Alerts** - Monitor margins, stock, and trends\n📈 **Growth** - Find new products, identify opportunities\n\nJust ask me anything about your dropshipping business!`,
    };
  }

  // Default response
  return {
    content: `I understand you're asking about "${input}". Here's what I can help with:\n\n${
      suggestions.length > 0
        ? `📋 You have **${suggestions.length} active suggestions** that might be relevant. Would you like me to show them?`
        : `I can analyze your ${products.length} products, check margins, find opportunities, or help with any specific task.`
    }\n\nHow can I assist you further?`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loading Spinner
 */
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' };
  return (
    <svg className={`animate-spin ${sizeClasses[size]} text-blue-600`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/**
 * Typing Indicator
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-gray-500 ml-2">AI is thinking...</span>
    </div>
  );
}

/**
 * Bot Header
 */
function BotHeader({
  viewMode,
  onViewModeChange,
  onMinimize,
  onExpand,
  isExpanded,
  unreadCount,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onMinimize: () => void;
  onExpand: () => void;
  isExpanded: boolean;
  unreadCount: number;
}) {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
          <span className="text-lg">🤖</span>
        </div>
        <div>
          <h3 className="font-medium text-sm">AI Assistant</h3>
          <p className="text-xs text-blue-200">Always here to help</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* View tabs */}
        <div className="flex bg-white/10 rounded-lg p-0.5">
          {(['chat', 'suggestions'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                viewMode === mode
                  ? 'bg-white text-blue-600'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              {mode === 'chat' ? '💬' : '💡'}
              {mode === 'suggestions' && unreadCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs px-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* Expand/collapse */}
        <button
          onClick={onExpand}
          className="p-1 text-white/80 hover:text-white"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
        {/* Minimize */}
        <button
          onClick={onMinimize}
          className="p-1 text-white/80 hover:text-white"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Chat Message Component
 */
function ChatMessageComponent({
  message,
  onActionClick,
}: {
  message: ChatMessage;
  onActionClick?: (action: SuggestionAction) => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-blue-600 text-white'
            : isSystem
            ? 'bg-gray-100 text-gray-600 text-sm italic'
            : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        {/* Loading state */}
        {message.isLoading ? (
          <TypingIndicator />
        ) : (
          <>
            {/* Content with markdown-like formatting */}
            <div className="text-sm whitespace-pre-wrap">
              {message.content.split('\n').map((line, i) => {
                // Bold
                let formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                return (
                  <p
                    key={i}
                    className={i > 0 ? 'mt-2' : ''}
                    dangerouslySetInnerHTML={{ __html: formatted }}
                  />
                );
              })}
            </div>

            {/* Actions */}
            {message.actions && message.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                {message.actions.map(action => (
                  <button
                    key={action.id}
                    onClick={() => onActionClick?.(action)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      action.isDestructive
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Error */}
            {message.error && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {message.error.message}
              </div>
            )}
          </>
        )}

        {/* Timestamp */}
        {!message.isLoading && (
          <p className={`text-xs mt-1 ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
            {formatRelativeTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Chat Input Component
 */
function ChatInput({
  onSend,
  isDisabled,
  quickActions,
  onQuickAction,
}: {
  onSend: (message: string) => void;
  isDisabled: boolean;
  quickActions: typeof QUICK_ACTIONS;
  onQuickAction: (actionId: string) => void;
}) {
  const [input, setInput] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isDisabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-gray-200 p-3">
      {/* Quick Actions */}
      {showQuickActions && (
        <div className="mb-3 flex flex-wrap gap-2">
          {quickActions.map(action => (
            <button
              key={action.id}
              onClick={() => {
                onQuickAction(action.id);
                setShowQuickActions(false);
              }}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 flex items-center gap-1"
            >
              <span>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowQuickActions(!showQuickActions)}
          className={`p-2 rounded-full transition-colors ${
            showQuickActions
              ? 'bg-blue-100 text-blue-600'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          title="Quick actions"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder="Ask me anything..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!input.trim() || isDisabled}
          className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/**
 * Suggestion Card Component
 */
function SuggestionCard({
  suggestion,
  onToggleExpand,
  onApply,
  onDismiss,
  onSnooze,
}: {
  suggestion: EnrichedSuggestion;
  onToggleExpand: () => void;
  onApply: () => void;
  onDismiss: () => void;
  onSnooze: (hours: number) => void;
}) {
  const typeConfig = SUGGESTION_TYPE_CONFIG[suggestion.type];
  const priorityConfig = PRIORITY_CONFIG[suggestion.priority];

  if (suggestion.isDismissed) return null;
  if (suggestion.snoozedUntil && new Date(suggestion.snoozedUntil) > new Date()) return null;

  return (
    <div className={`bg-white border rounded-lg overflow-hidden transition-all ${
      suggestion.isExpanded ? 'shadow-md' : 'hover:shadow-sm'
    }`}>
      {/* Header */}
      <div
        onClick={onToggleExpand}
        className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50"
      >
        <span className="text-xl">{typeConfig.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded bg-${priorityConfig.color}-100 text-${priorityConfig.color}-700`}>
              {priorityConfig.label}
            </span>
            <span className="text-xs text-gray-500">{formatRelativeTime(suggestion.createdAt)}</span>
          </div>
          <h4 className="font-medium text-gray-900 text-sm">{suggestion.title}</h4>
          {!suggestion.isExpanded && (
            <p className="text-xs text-gray-500 mt-1 truncate">{suggestion.description}</p>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${suggestion.isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded Content */}
      {suggestion.isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <p className="text-sm text-gray-600 mt-3">{suggestion.description}</p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-gray-50 rounded p-2 text-center">
              <p className="text-lg font-bold text-blue-600">{suggestion.affectedProducts.length}</p>
              <p className="text-xs text-gray-500">Products</p>
            </div>
            <div className="bg-gray-50 rounded p-2 text-center">
              <p className="text-lg font-bold text-green-600">+{suggestion.potentialImpact}%</p>
              <p className="text-xs text-gray-500">Impact</p>
            </div>
            <div className="bg-gray-50 rounded p-2 text-center">
              <p className="text-lg font-bold text-purple-600">{(suggestion.confidence * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-500">Confidence</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={onApply}
              disabled={suggestion.isApplying}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {suggestion.isApplying ? (
                <>
                  <LoadingSpinner size="sm" />
                  Applying...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Apply
                </>
              )}
            </button>
            <button
              onClick={() => onSnooze(24)}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              title="Snooze for 24 hours"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Suggestions View
 */
function SuggestionsView({
  suggestions,
  onToggleExpand,
  onApply,
  onDismiss,
  onSnooze,
}: {
  suggestions: EnrichedSuggestion[];
  onToggleExpand: (id: string) => void;
  onApply: (suggestion: EnrichedSuggestion) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, hours: number) => void;
}) {
  const activeSuggestions = suggestions.filter(s => !s.isDismissed && (!s.snoozedUntil || new Date(s.snoozedUntil) <= new Date()));
  
  const groupedSuggestions = useMemo(() => {
    const groups: Record<SuggestionPriority, EnrichedSuggestion[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };
    activeSuggestions.forEach(s => groups[s.priority].push(s));
    return groups;
  }, [activeSuggestions]);

  if (activeSuggestions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900">All caught up!</h3>
          <p className="text-sm text-gray-500 mt-1">No active suggestions at the moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {activeSuggestions.length} Active Suggestions
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Potential impact: +{activeSuggestions.reduce((sum, s) => sum + s.potentialImpact, 0)}% improvement
            </p>
          </div>
          <div className="flex gap-1">
            {Object.entries(groupedSuggestions).map(([priority, items]) => items.length > 0 && (
              <span
                key={priority}
                className={`px-2 py-1 text-xs font-medium rounded bg-${PRIORITY_CONFIG[priority as SuggestionPriority].color}-100 text-${PRIORITY_CONFIG[priority as SuggestionPriority].color}-700`}
              >
                {items.length}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Suggestion Cards */}
      {activeSuggestions.map(suggestion => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          onToggleExpand={() => onToggleExpand(suggestion.id)}
          onApply={() => onApply(suggestion)}
          onDismiss={() => onDismiss(suggestion.id)}
          onSnooze={(hours) => onSnooze(suggestion.id, hours)}
        />
      ))}
    </div>
  );
}

/**
 * Chat View
 */
function ChatView({
  messages,
  isTyping,
  onActionClick,
}: {
  messages: ChatMessage[];
  isTyping: boolean;
  onActionClick: (action: SuggestionAction) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">🤖</span>
            </div>
            <h3 className="font-medium text-gray-900">How can I help you?</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Ask me about your products, margins, pricing, or use quick actions below.
            </p>
          </div>
        </div>
      ) : (
        <>
          {messages.map(message => (
            <ChatMessageComponent
              key={message.id}
              message={message}
              onActionClick={onActionClick}
            />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}

/**
 * History View
 */
function HistoryView({
  history,
  onSelectConversation,
}: {
  history: ConversationEntry[];
  onSelectConversation: (entry: ConversationEntry) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-medium text-gray-900">No conversation history</h3>
          <p className="text-sm text-gray-500 mt-1">Your conversations will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {history.map(entry => (
        <button
          key={entry.id}
          onClick={() => onSelectConversation(entry)}
          className="w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm text-gray-900 truncate">{entry.title}</span>
            <span className="text-xs text-gray-500">{formatRelativeTime(entry.timestamp)}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{entry.preview}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">{entry.messageCount} messages</span>
            {entry.suggestions.length > 0 && (
              <span className="text-xs text-blue-600">{entry.suggestions.length} suggestions</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * Settings View
 */
function SettingsView({
  settings,
  onSettingsChange,
}: {
  settings: BotSettings;
  onSettingsChange: (settings: Partial<BotSettings>) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Auto Suggest */}
      <div>
        <label className="flex items-center justify-between">
          <div>
            <span className="font-medium text-sm text-gray-900">Auto Suggestions</span>
            <p className="text-xs text-gray-500">Automatically generate suggestions</p>
          </div>
          <input
            type="checkbox"
            checked={settings.autoSuggest}
            onChange={(e) => onSettingsChange({ autoSuggest: e.target.checked })}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
        </label>
      </div>

      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Suggestion Frequency
        </label>
        <select
          value={settings.suggestFrequency}
          onChange={(e) => onSettingsChange({ suggestFrequency: e.target.value as BotSettings['suggestFrequency'] })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="realtime">Real-time</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
        </select>
      </div>

      {/* Priority Threshold */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Minimum Priority
        </label>
        <select
          value={settings.priorityThreshold}
          onChange={(e) => onSettingsChange({ priorityThreshold: e.target.value as SuggestionPriority })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="critical">Critical only</option>
          <option value="high">High and above</option>
          <option value="medium">Medium and above</option>
          <option value="low">All suggestions</option>
        </select>
      </div>

      {/* Notifications */}
      <div>
        <label className="flex items-center justify-between">
          <div>
            <span className="font-medium text-sm text-gray-900">Notifications</span>
            <p className="text-xs text-gray-500">Show notification badges</p>
          </div>
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) => onSettingsChange({ notificationsEnabled: e.target.checked })}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
        </label>
      </div>

      {/* Sound */}
      <div>
        <label className="flex items-center justify-between">
          <div>
            <span className="font-medium text-sm text-gray-900">Sound Effects</span>
            <p className="text-xs text-gray-500">Play sounds for new suggestions</p>
          </div>
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => onSettingsChange({ soundEnabled: e.target.checked })}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Minimized Bot Button
 */
function MinimizedBot({
  onClick,
  unreadCount,
}: {
  onClick: () => void;
  unreadCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full shadow-lg flex items-center justify-center text-white hover:shadow-xl transition-all hover:scale-105 relative"
      aria-label={`Open AI assistant${unreadCount > 0 ? `, ${unreadCount} unread notifications` : ''}`}
      aria-expanded="false"
      aria-haspopup="dialog"
    >
      <span className="text-2xl" aria-hidden="true">🤖</span>
      {unreadCount > 0 && (
        <span 
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
          aria-label={`${unreadCount} unread notifications`}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function AISuggestionBot({
  products,
  onApplySuggestion,
  onProductAction,
  className = '',
}: AISuggestionBotProps) {
  const [state, dispatch] = useReducer(botReducer, initialState);
  const conversationIdRef = useRef<string>(generateId());
  const botContainerRef = useRef<HTMLDivElement>(null);

  // Storage key for persistence
  const STORAGE_KEY = 'dropship-ai-bot-state';

  // Load state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        // Only restore messages and history, not UI state
        if (parsed.messages && Array.isArray(parsed.messages)) {
          parsed.messages.forEach((msg: ChatMessage) => {
            dispatch({ type: 'ADD_MESSAGE', payload: msg });
          });
        }
        if (parsed.conversationHistory && Array.isArray(parsed.conversationHistory)) {
          dispatch({ type: 'SET_HISTORY', payload: parsed.conversationHistory });
        }
        if (parsed.settings) {
          dispatch({ type: 'UPDATE_SETTINGS', payload: parsed.settings });
        }
      }
    } catch (error) {
      console.error('Failed to load AI bot state:', error);
    }
  }, []);

  // Save state to localStorage on changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stateToSave = {
        messages: state.messages.slice(-MAX_MESSAGES), // Keep last N messages
        conversationHistory: state.conversationHistory.slice(-MAX_HISTORY),
        settings: state.settings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Failed to save AI bot state:', error);
    }
  }, [state.messages, state.conversationHistory, state.settings]);

  // Keyboard navigation - Escape to minimize
  useEffect(() => {
    if (state.botState === 'minimized') return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch({ type: 'SET_BOT_STATE', payload: 'minimized' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.botState]);

  // Generate suggestions on products change
  useEffect(() => {
    const suggestions = generateSuggestions(products);
    dispatch({ type: 'SET_SUGGESTIONS', payload: suggestions });
    
    // Update unread count for new suggestions
    if (state.botState === 'minimized' && suggestions.length > state.suggestions.length) {
      dispatch({ type: 'SET_UNREAD_COUNT', payload: suggestions.length });
    }
  }, [products]);

  // Welcome message
  useEffect(() => {
    if (state.messages.length === 0) {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: generateId(),
          role: 'assistant',
          content: `👋 **Welcome!** I'm your AI assistant.\n\nI've analyzed your ${products.length} products and have ${state.suggestions.length} suggestions for you.\n\nHow can I help you today?`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(async (content: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    // Show typing indicator
    dispatch({ type: 'SET_IS_TYPING', payload: true });

    // Generate AI response
    await new Promise(resolve => setTimeout(resolve, RESPONSE_DELAY + Math.random() * 500));

    const response = generateAIResponse(content, products, state.suggestions);

    // Add assistant message
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
      suggestions: response.suggestions,
      actions: response.suggestions && response.suggestions.length > 0
        ? [
            { id: 'view', label: 'View suggestions', type: 'view_details' },
            { id: 'apply_all', label: 'Apply all', type: 'apply' },
          ]
        : undefined,
    };

    dispatch({ type: 'SET_IS_TYPING', payload: false });
    dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
  }, [products, state.suggestions]);

  const handleQuickAction = useCallback(async (actionId: string) => {
    const actionMessages: Record<string, string> = {
      check_margins: 'Check my low margin products',
      refresh_stale: 'Which products need a price refresh?',
      find_deals: 'Help me find new deals',
      analyze_trends: 'What are the current trends in my inventory?',
      export_report: 'Generate a report of my products',
    };

    const message = actionMessages[actionId];
    if (message) {
      handleSendMessage(message);
    }
  }, [handleSendMessage]);

  const handleApplySuggestion = useCallback(async (suggestion: EnrichedSuggestion) => {
    dispatch({
      type: 'UPDATE_SUGGESTION',
      payload: { id: suggestion.id, updates: { isApplying: true } },
    });

    try {
      await onApplySuggestion(suggestion);
      
      dispatch({
        type: 'DISMISS_SUGGESTION',
        payload: suggestion.id,
      });

      // Add success message
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: generateId(),
          role: 'system',
          content: `✅ Applied suggestion: ${suggestion.title}`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      dispatch({
        type: 'UPDATE_SUGGESTION',
        payload: {
          id: suggestion.id,
          updates: { isApplying: false },
        },
      });

      // Add error message
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: generateId(),
          role: 'system',
          content: `❌ Failed to apply suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }, [onApplySuggestion]);

  const handleActionClick = useCallback((action: SuggestionAction) => {
    if (action.type === 'view_details') {
      dispatch({ type: 'SET_VIEW_MODE', payload: 'suggestions' });
    } else if (action.type === 'apply') {
      // Apply all visible suggestions
      state.suggestions
        .filter(s => !s.isDismissed && !s.snoozedUntil)
        .forEach(s => handleApplySuggestion(s));
    }
  }, [state.suggestions, handleApplySuggestion]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // Minimized state
  if (state.botState === 'minimized') {
    return (
      <div className={`fixed bottom-6 right-6 z-50 ${className}`} role="complementary" aria-label="AI Assistant">
        <MinimizedBot
          onClick={() => dispatch({ type: 'SET_BOT_STATE', payload: 'open' })}
          unreadCount={state.unreadCount}
        />
      </div>
    );
  }

  // Open/Expanded state
  const isExpanded = state.botState === 'expanded';
  const widthClass = isExpanded ? 'w-[600px]' : 'w-[380px]';
  const heightClass = isExpanded ? 'h-[700px]' : 'h-[500px]';

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${className}`} role="complementary" aria-label="AI Assistant">
      <div
        ref={botContainerRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="ai-bot-title"
        aria-describedby="ai-bot-description"
        className={`${widthClass} ${heightClass} bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300`}
      >
        <span id="ai-bot-title" className="sr-only">AI Assistant</span>
        <span id="ai-bot-description" className="sr-only">Chat with your AI assistant to manage products, view suggestions, and get help</span>
        
        {/* Header */}
        <BotHeader
          viewMode={state.viewMode}
          onViewModeChange={(mode) => dispatch({ type: 'SET_VIEW_MODE', payload: mode })}
          onMinimize={() => dispatch({ type: 'SET_BOT_STATE', payload: 'minimized' })}
          onExpand={() => dispatch({
            type: 'SET_BOT_STATE',
            payload: isExpanded ? 'open' : 'expanded',
          })}
          isExpanded={isExpanded}
          unreadCount={state.suggestions.filter(s => !s.isDismissed).length}
        />

        {/* Content */}
        {state.viewMode === 'chat' && (
          <>
            <ChatView
              messages={state.messages}
              isTyping={state.isTyping}
              onActionClick={handleActionClick}
            />
            <ChatInput
              onSend={handleSendMessage}
              isDisabled={state.isTyping}
              quickActions={QUICK_ACTIONS}
              onQuickAction={handleQuickAction}
            />
          </>
        )}

        {state.viewMode === 'suggestions' && (
          <SuggestionsView
            suggestions={state.suggestions}
            onToggleExpand={(id) => dispatch({
              type: 'UPDATE_SUGGESTION',
              payload: {
                id,
                updates: {
                  isExpanded: !state.suggestions.find(s => s.id === id)?.isExpanded,
                },
              },
            })}
            onApply={handleApplySuggestion}
            onDismiss={(id) => dispatch({ type: 'DISMISS_SUGGESTION', payload: id })}
            onSnooze={(id, hours) => dispatch({
              type: 'SNOOZE_SUGGESTION',
              payload: {
                id,
                until: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
              },
            })}
          />
        )}

        {state.viewMode === 'history' && (
          <HistoryView
            history={state.history}
            onSelectConversation={(entry) => {
              // Would load conversation
              dispatch({ type: 'SET_VIEW_MODE', payload: 'chat' });
            }}
          />
        )}

        {state.viewMode === 'settings' && (
          <SettingsView
            settings={state.settings}
            onSettingsChange={(settings) => dispatch({ type: 'SET_SETTINGS', payload: settings })}
          />
        )}

        {/* Error */}
        {state.error && (
          <div className="p-3 border-t border-gray-200">
            <InlineError
              error={state.error}
              onDismiss={() => dispatch({ type: 'SET_ERROR', payload: null })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default AISuggestionBot;
