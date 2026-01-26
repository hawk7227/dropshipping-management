'use client';

// components/notifications/NotificationSettings.tsx
// COMPLETE Notification Settings Panel - Configure SMS, email, and in-app alerts
// Handles: channel settings, alert types, thresholds, schedules, test notifications

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
} from 'react';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

// Notification channels
type NotificationChannel = 'sms' | 'email' | 'push' | 'in_app';

// Alert types
type AlertType = 
  | 'margin_drop'
  | 'price_change'
  | 'stock_alert'
  | 'sync_failure'
  | 'daily_summary'
  | 'weekly_report'
  | 'new_suggestion'
  | 'queue_stuck';

// Channel configuration
interface ChannelConfig {
  enabled: boolean;
  verified: boolean;
  destination: string;
  dailyLimit: number;
  usedToday: number;
}

// Alert configuration
interface AlertConfig {
  type: AlertType;
  enabled: boolean;
  channels: NotificationChannel[];
  threshold?: number;
  cooldown: number; // minutes
  schedule?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    days: number[]; // 0-6, Sunday-Saturday
  };
}

// Complete settings
interface NotificationSettings {
  channels: Record<NotificationChannel, ChannelConfig>;
  alerts: AlertConfig[];
  globalMute: boolean;
  muteUntil: string | null;
  timezone: string;
}

// Component props
interface NotificationSettingsProps {
  onSave: (settings: NotificationSettings) => Promise<void>;
  onTestNotification: (channel: NotificationChannel) => Promise<void>;
  className?: string;
}

// Toast notification
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CHANNEL_CONFIG: Record<NotificationChannel, { label: string; icon: string; description: string }> = {
  sms: {
    label: 'SMS',
    icon: '📱',
    description: 'Text message alerts to your phone',
  },
  email: {
    label: 'Email',
    icon: '📧',
    description: 'Email notifications and reports',
  },
  push: {
    label: 'Push',
    icon: '🔔',
    description: 'Browser push notifications',
  },
  in_app: {
    label: 'In-App',
    icon: '💬',
    description: 'Notifications within the dashboard',
  },
};

const ALERT_CONFIG: Record<AlertType, { label: string; icon: string; description: string; hasThreshold: boolean }> = {
  margin_drop: {
    label: 'Margin Drop',
    icon: '📉',
    description: 'When product profit margin drops below threshold',
    hasThreshold: true,
  },
  price_change: {
    label: 'Price Change',
    icon: '💰',
    description: 'When Amazon price changes significantly',
    hasThreshold: true,
  },
  stock_alert: {
    label: 'Stock Alert',
    icon: '📦',
    description: 'When product goes out of stock or back in stock',
    hasThreshold: false,
  },
  sync_failure: {
    label: 'Sync Failure',
    icon: '⚠️',
    description: 'When Shopify sync fails multiple times',
    hasThreshold: true,
  },
  daily_summary: {
    label: 'Daily Summary',
    icon: '📊',
    description: 'Daily overview of your inventory',
    hasThreshold: false,
  },
  weekly_report: {
    label: 'Weekly Report',
    icon: '📈',
    description: 'Weekly performance and insights report',
    hasThreshold: false,
  },
  new_suggestion: {
    label: 'New Suggestion',
    icon: '💡',
    description: 'When AI has new optimization suggestions',
    hasThreshold: false,
  },
  queue_stuck: {
    label: 'Queue Stuck',
    icon: '🔄',
    description: 'When sync queue is stalled or stuck',
    hasThreshold: true,
  },
};

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (AZ)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_SETTINGS: NotificationSettings = {
  channels: {
    sms: { enabled: false, verified: false, destination: '', dailyLimit: 10, usedToday: 0 },
    email: { enabled: true, verified: true, destination: '', dailyLimit: 50, usedToday: 0 },
    push: { enabled: true, verified: true, destination: '', dailyLimit: 100, usedToday: 0 },
    in_app: { enabled: true, verified: true, destination: '', dailyLimit: 1000, usedToday: 0 },
  },
  alerts: [
    { type: 'margin_drop', enabled: true, channels: ['email', 'in_app'], threshold: 30, cooldown: 60 },
    { type: 'price_change', enabled: true, channels: ['in_app'], threshold: 10, cooldown: 30 },
    { type: 'stock_alert', enabled: true, channels: ['email', 'in_app'], cooldown: 120 },
    { type: 'sync_failure', enabled: true, channels: ['email'], threshold: 3, cooldown: 60 },
    { type: 'daily_summary', enabled: true, channels: ['email'], cooldown: 1440, schedule: { enabled: true, startHour: 8, endHour: 9, days: [1, 2, 3, 4, 5] } },
    { type: 'weekly_report', enabled: true, channels: ['email'], cooldown: 10080, schedule: { enabled: true, startHour: 9, endHour: 10, days: [1] } },
    { type: 'new_suggestion', enabled: true, channels: ['in_app'], cooldown: 60 },
    { type: 'queue_stuck', enabled: true, channels: ['email', 'in_app'], threshold: 30, cooldown: 120 },
  ],
  globalMute: false,
  muteUntil: null,
  timezone: 'America/New_York',
};

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

type SettingsAction =
  | { type: 'SET_SETTINGS'; payload: NotificationSettings }
  | { type: 'UPDATE_CHANNEL'; payload: { channel: NotificationChannel; updates: Partial<ChannelConfig> } }
  | { type: 'UPDATE_ALERT'; payload: { alertType: AlertType; updates: Partial<AlertConfig> } }
  | { type: 'TOGGLE_ALERT_CHANNEL'; payload: { alertType: AlertType; channel: NotificationChannel } }
  | { type: 'SET_GLOBAL_MUTE'; payload: boolean }
  | { type: 'SET_MUTE_UNTIL'; payload: string | null }
  | { type: 'SET_TIMEZONE'; payload: string }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: string };

interface SettingsState {
  settings: NotificationSettings;
  originalSettings: NotificationSettings;
  isSaving: boolean;
  error: ApiError | null;
  toasts: Toast[];
  hasChanges: boolean;
}

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'SET_SETTINGS':
      return {
        ...state,
        settings: action.payload,
        originalSettings: action.payload,
        hasChanges: false,
      };

    case 'UPDATE_CHANNEL':
      return {
        ...state,
        settings: {
          ...state.settings,
          channels: {
            ...state.settings.channels,
            [action.payload.channel]: {
              ...state.settings.channels[action.payload.channel],
              ...action.payload.updates,
            },
          },
        },
        hasChanges: true,
      };

    case 'UPDATE_ALERT': {
      const alertIndex = state.settings.alerts.findIndex(a => a.type === action.payload.alertType);
      if (alertIndex === -1) return state;

      const newAlerts = [...state.settings.alerts];
      newAlerts[alertIndex] = { ...newAlerts[alertIndex], ...action.payload.updates };

      return {
        ...state,
        settings: { ...state.settings, alerts: newAlerts },
        hasChanges: true,
      };
    }

    case 'TOGGLE_ALERT_CHANNEL': {
      const alertIndex = state.settings.alerts.findIndex(a => a.type === action.payload.alertType);
      if (alertIndex === -1) return state;

      const alert = state.settings.alerts[alertIndex];
      const hasChannel = alert.channels.includes(action.payload.channel);
      const newChannels = hasChannel
        ? alert.channels.filter(c => c !== action.payload.channel)
        : [...alert.channels, action.payload.channel];

      const newAlerts = [...state.settings.alerts];
      newAlerts[alertIndex] = { ...alert, channels: newChannels };

      return {
        ...state,
        settings: { ...state.settings, alerts: newAlerts },
        hasChanges: true,
      };
    }

    case 'SET_GLOBAL_MUTE':
      return {
        ...state,
        settings: { ...state.settings, globalMute: action.payload },
        hasChanges: true,
      };

    case 'SET_MUTE_UNTIL':
      return {
        ...state,
        settings: { ...state.settings, muteUntil: action.payload },
        hasChanges: true,
      };

    case 'SET_TIMEZONE':
      return {
        ...state,
        settings: { ...state.settings, timezone: action.payload },
        hasChanges: true,
      };

    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isSaving: false };

    case 'ADD_TOAST': {
      const toast: Toast = {
        ...action.payload,
        id: `toast-${Date.now()}`,
      };
      return { ...state, toasts: [...state.toasts, toast] };
    }

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };

    default:
      return state;
  }
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
 * Toggle Switch
 */
function ToggleSwitch({
  enabled,
  onChange,
  disabled = false,
  label,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label || (enabled ? 'Enabled' : 'Disabled')}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        enabled ? 'bg-blue-600' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Channel Card
 */
function ChannelCard({
  channel,
  config,
  onUpdate,
  onTest,
  isTesting,
}: {
  channel: NotificationChannel;
  config: ChannelConfig;
  onUpdate: (updates: Partial<ChannelConfig>) => void;
  onTest: () => void;
  isTesting: boolean;
}) {
  const channelInfo = CHANNEL_CONFIG[channel];
  const [showSetup, setShowSetup] = useState(!config.verified && config.enabled);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validation functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  };

  const handleDestinationChange = (value: string) => {
    onUpdate({ destination: value });
    
    // Validate on change
    if (channel === 'email' && value && !validateEmail(value)) {
      setValidationError('Please enter a valid email address');
    } else if (channel === 'sms' && value && !validatePhone(value)) {
      setValidationError('Please enter a valid phone number (10-15 digits)');
    } else {
      setValidationError(null);
    }
  };

  const inputId = `${channel}-destination`;
  const errorId = `${channel}-error`;

  return (
    <div 
      className={`bg-white border rounded-lg p-4 ${config.enabled ? 'border-blue-200' : 'border-gray-200'}`}
      role="region"
      aria-labelledby={`${channel}-title`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">{channelInfo.icon}</span>
          <div>
            <h3 id={`${channel}-title`} className="font-medium text-gray-900">{channelInfo.label}</h3>
            <p className="text-sm text-gray-500">{channelInfo.description}</p>
          </div>
        </div>
        <ToggleSwitch 
          enabled={config.enabled} 
          onChange={(enabled) => onUpdate({ enabled })} 
          label={`Enable ${channelInfo.label} notifications`}
        />
      </div>

      {config.enabled && (
        <div className="mt-4 space-y-4">
          {/* Verification Status */}
          {!config.verified && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3" role="alert">
              <div className="flex items-center gap-2 text-yellow-800">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Not Verified</span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                Please verify your {channelInfo.label.toLowerCase()} to receive notifications.
              </p>
            </div>
          )}

          {/* Destination Input */}
          {(channel === 'sms' || channel === 'email') && (
            <div>
              <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
                {channel === 'sms' ? 'Phone Number' : 'Email Address'}
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  type={channel === 'email' ? 'email' : 'tel'}
                  value={config.destination}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  placeholder={channel === 'sms' ? '+1 (555) 123-4567' : 'you@example.com'}
                  aria-describedby={validationError ? errorId : undefined}
                  aria-invalid={validationError ? 'true' : undefined}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationError ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {config.verified && (
                  <span className="flex items-center gap-1 px-3 text-green-600 text-sm" aria-label="Verified">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
              {validationError && (
                <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
                  {validationError}
                </p>
              )}
            </div>
          )}

          {/* Daily Limit */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Daily Limit</p>
              <p className="text-xs text-gray-500">{config.usedToday} of {config.dailyLimit} used today</p>
            </div>
            <div className="w-32">
              <div 
                className="h-2 bg-gray-200 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={config.usedToday}
                aria-valuemin={0}
                aria-valuemax={config.dailyLimit}
                aria-label={`${config.usedToday} of ${config.dailyLimit} notifications used today`}
              >
                <div
                  className={`h-full rounded-full ${
                    config.usedToday / config.dailyLimit > 0.8 ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${(config.usedToday / config.dailyLimit) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Test Button */}
          <button
            onClick={onTest}
            disabled={isTesting || !config.verified || !!validationError}
            aria-label={`Send test ${channelInfo.label.toLowerCase()} notification`}
            className="w-full px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <>
                <LoadingSpinner size="sm" />
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send Test Notification
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Alert Configuration Card
 */
function AlertCard({
  alert,
  enabledChannels,
  onUpdate,
  onToggleChannel,
}: {
  alert: AlertConfig;
  enabledChannels: NotificationChannel[];
  onUpdate: (updates: Partial<AlertConfig>) => void;
  onToggleChannel: (channel: NotificationChannel) => void;
}) {
  const alertInfo = ALERT_CONFIG[alert.type];
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`bg-white border rounded-lg overflow-hidden ${
      alert.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
    }`}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{alertInfo.icon}</span>
          <div>
            <h4 className="font-medium text-gray-900">{alertInfo.label}</h4>
            <p className="text-xs text-gray-500">{alertInfo.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ToggleSwitch
            enabled={alert.enabled}
            onChange={(enabled) => onUpdate({ enabled })}
          />
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Configuration */}
      {isExpanded && alert.enabled && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
          {/* Channels */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notification Channels
            </label>
            <div className="flex flex-wrap gap-2">
              {enabledChannels.map(channel => {
                const isSelected = alert.channels.includes(channel);
                return (
                  <button
                    key={channel}
                    onClick={() => onToggleChannel(channel)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {CHANNEL_CONFIG[channel].icon} {CHANNEL_CONFIG[channel].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Threshold (if applicable) */}
          {alertInfo.hasThreshold && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Threshold
                {alert.type === 'margin_drop' && ' (%)'}
                {alert.type === 'price_change' && ' (% change)'}
                {alert.type === 'sync_failure' && ' (failures)'}
                {alert.type === 'queue_stuck' && ' (minutes)'}
              </label>
              <input
                type="number"
                value={alert.threshold || 0}
                onChange={(e) => onUpdate({ threshold: parseInt(e.target.value) || 0 })}
                min="0"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Cooldown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cooldown (minutes)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Minimum time between notifications for the same alert
            </p>
            <select
              value={alert.cooldown}
              onChange={(e) => onUpdate({ cooldown: parseInt(e.target.value) })}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="360">6 hours</option>
              <option value="720">12 hours</option>
              <option value="1440">24 hours</option>
            </select>
          </div>

          {/* Schedule (for reports) */}
          {alert.schedule && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Schedule</span>
                <ToggleSwitch
                  enabled={alert.schedule.enabled}
                  onChange={(enabled) => onUpdate({
                    schedule: { ...alert.schedule!, enabled },
                  })}
                />
              </div>

              {alert.schedule.enabled && (
                <>
                  {/* Time */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Send between</span>
                    <select
                      value={alert.schedule.startHour}
                      onChange={(e) => onUpdate({
                        schedule: { ...alert.schedule!, startHour: parseInt(e.target.value) },
                      })}
                      className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {i.toString().padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-600">and</span>
                    <select
                      value={alert.schedule.endHour}
                      onChange={(e) => onUpdate({
                        schedule: { ...alert.schedule!, endHour: parseInt(e.target.value) },
                      })}
                      className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {i.toString().padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Days */}
                  <div>
                    <span className="text-sm text-gray-600 block mb-2">Days</span>
                    <div className="flex gap-1">
                      {DAYS_OF_WEEK.map((day, index) => {
                        const isSelected = alert.schedule!.days.includes(index);
                        return (
                          <button
                            key={day}
                            onClick={() => {
                              const newDays = isSelected
                                ? alert.schedule!.days.filter(d => d !== index)
                                : [...alert.schedule!.days, index].sort();
                              onUpdate({ schedule: { ...alert.schedule!, days: newDays } });
                            }}
                            className={`w-10 h-10 text-xs rounded-full transition-colors ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Global Settings Card
 */
function GlobalSettingsCard({
  settings,
  onMuteChange,
  onMuteUntilChange,
  onTimezoneChange,
}: {
  settings: NotificationSettings;
  onMuteChange: (muted: boolean) => void;
  onMuteUntilChange: (until: string | null) => void;
  onTimezoneChange: (timezone: string) => void;
}) {
  const muteOptions = [
    { label: '1 hour', hours: 1 },
    { label: '4 hours', hours: 4 },
    { label: '8 hours', hours: 8 },
    { label: '24 hours', hours: 24 },
    { label: 'Until tomorrow', hours: 0 },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="font-medium text-gray-900">Global Settings</h3>

      {/* Global Mute */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-700">Mute All Notifications</p>
          <p className="text-xs text-gray-500">Temporarily silence all alerts</p>
        </div>
        <ToggleSwitch enabled={settings.globalMute} onChange={onMuteChange} />
      </div>

      {settings.globalMute && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800 mb-2">
            {settings.muteUntil
              ? `Muted until ${new Date(settings.muteUntil).toLocaleString()}`
              : 'All notifications are muted'}
          </p>
          <div className="flex flex-wrap gap-2">
            {muteOptions.map(option => (
              <button
                key={option.label}
                onClick={() => {
                  const until = option.hours > 0
                    ? new Date(Date.now() + option.hours * 60 * 60 * 1000).toISOString()
                    : new Date(new Date().setHours(24, 0, 0, 0)).toISOString();
                  onMuteUntilChange(until);
                }}
                className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200"
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={() => {
                onMuteChange(false);
                onMuteUntilChange(null);
              }}
              className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-full hover:bg-red-200"
            >
              Unmute
            </button>
          </div>
        </div>
      )}

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
        <select
          value={settings.timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Toast Container
 */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <ToastNotification key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * Toast Notification
 */
function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bgClasses = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`${bgClasses[toast.type]} border rounded-lg shadow-lg p-4 min-w-[280px]`}>
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="font-medium text-gray-900">{toast.title}</p>
          <p className="text-sm text-gray-600">{toast.message}</p>
        </div>
        <button onClick={() => onDismiss(toast.id)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function NotificationSettings({
  onSave,
  onTestNotification,
  className = '',
}: NotificationSettingsProps) {
  const [state, dispatch] = useReducer(settingsReducer, {
    settings: DEFAULT_SETTINGS,
    originalSettings: DEFAULT_SETTINGS,
    isSaving: false,
    error: null,
    toasts: [],
    hasChanges: false,
  });

  const [testingChannel, setTestingChannel] = useState<NotificationChannel | null>(null);
  const [activeTab, setActiveTab] = useState<'channels' | 'alerts'>('channels');

  // Warn user about unsaved changes when leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.hasChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [state.hasChanges]);

  // Get enabled channels for alert configuration
  const enabledChannels = useMemo(() => {
    return (Object.entries(state.settings.channels) as [NotificationChannel, ChannelConfig][])
      .filter(([_, config]) => config.enabled && config.verified)
      .map(([channel]) => channel);
  }, [state.settings.channels]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    dispatch({ type: 'ADD_TOAST', payload: toast });
  }, []);

  const handleSave = useCallback(async () => {
    dispatch({ type: 'SET_SAVING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      await onSave(state.settings);
      dispatch({ type: 'SET_SETTINGS', payload: state.settings });
      addToast({
        type: 'success',
        title: 'Settings Saved',
        message: 'Your notification settings have been updated',
      });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: {
          code: 'NOTIF_001',
          message: 'Failed to save settings',
          details: error instanceof Error ? error.message : 'Unknown error',
          suggestion: 'Please try again',
        },
      });
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.settings, onSave, addToast]);

  const handleTestNotification = useCallback(async (channel: NotificationChannel) => {
    setTestingChannel(channel);

    try {
      await onTestNotification(channel);
      addToast({
        type: 'success',
        title: 'Test Sent',
        message: `Test notification sent via ${CHANNEL_CONFIG[channel].label}`,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Test Failed',
        message: error instanceof Error ? error.message : 'Failed to send test notification',
      });
    } finally {
      setTestingChannel(null);
    }
  }, [onTestNotification, addToast]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'SET_SETTINGS', payload: state.originalSettings });
    addToast({
      type: 'info',
      title: 'Settings Reset',
      message: 'Changes have been discarded',
    });
  }, [state.originalSettings, addToast]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Notification Settings</h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure how and when you receive alerts
            </p>
          </div>
          {state.hasChanges && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={state.isSaving}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 disabled:opacity-50"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={state.isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {state.isSaving && <LoadingSpinner size="sm" />}
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="px-6 py-3 border-b border-gray-200">
          <InlineError
            error={state.error}
            onDismiss={() => dispatch({ type: 'SET_ERROR', payload: null })}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex" role="tablist" aria-label="Notification settings sections">
          <button
            onClick={() => setActiveTab('channels')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveTab('alerts');
              }
            }}
            role="tab"
            aria-selected={activeTab === 'channels'}
            aria-controls="channels-panel"
            tabIndex={activeTab === 'channels' ? 0 : -1}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
              activeTab === 'channels'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            Channels
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveTab('channels');
              }
            }}
            role="tab"
            aria-selected={activeTab === 'alerts'}
            aria-controls="alerts-panel"
            tabIndex={activeTab === 'alerts' ? 0 : -1}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
              activeTab === 'alerts'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            Alert Types
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Global Settings */}
        <div className="mb-6">
          <GlobalSettingsCard
            settings={state.settings}
            onMuteChange={(muted) => dispatch({ type: 'SET_GLOBAL_MUTE', payload: muted })}
            onMuteUntilChange={(until) => dispatch({ type: 'SET_MUTE_UNTIL', payload: until })}
            onTimezoneChange={(tz) => dispatch({ type: 'SET_TIMEZONE', payload: tz })}
          />
        </div>

        {/* Channels Tab */}
        {activeTab === 'channels' && (
          <div id="channels-panel" role="tabpanel" aria-labelledby="channels-tab" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.entries(state.settings.channels) as [NotificationChannel, ChannelConfig][]).map(
              ([channel, config]) => (
                <ChannelCard
                  key={channel}
                  channel={channel}
                  config={config}
                  onUpdate={(updates) => dispatch({
                    type: 'UPDATE_CHANNEL',
                    payload: { channel, updates },
                  })}
                  onTest={() => handleTestNotification(channel)}
                  isTesting={testingChannel === channel}
                />
              )
            )}
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div id="alerts-panel" role="tabpanel" aria-labelledby="alerts-tab" className="space-y-3">
            {state.settings.alerts.map(alert => (
              <AlertCard
                key={alert.type}
                alert={alert}
                enabledChannels={enabledChannels}
                onUpdate={(updates) => dispatch({
                  type: 'UPDATE_ALERT',
                  payload: { alertType: alert.type, updates },
                })}
                onToggleChannel={(channel) => dispatch({
                  type: 'TOGGLE_ALERT_CHANNEL',
                  payload: { alertType: alert.type, channel },
                })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toasts */}
      <ToastContainer
        toasts={state.toasts}
        onDismiss={(id) => dispatch({ type: 'REMOVE_TOAST', payload: id })}
      />
    </div>
  );
}

export default NotificationSettings;
