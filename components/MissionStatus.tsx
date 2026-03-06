// components/MissionStatus.tsx
// ═══════════════════════════════════════════════════════════
// MISSION STATUS HERO — Real-time system dashboard
// Always visible at top of Command Center + Products pages.
// Auto-refreshes every 30s. No manual updates needed.
// Shows: live clock, system stats, recent events, what's next.
// ═══════════════════════════════════════════════════════════

'use client';
import { useState, useEffect, useCallback } from 'react';

interface ShiftEvent {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  source: string;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  feedback: string | null;
}

interface SystemStats {
  products: {
    total: number;
    active: number;
    feedReady: number;
    feedRejected: number;
    feedPending: number;
  };
  todayEvents: number;
  timestamp: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  success: '#16a34a',
  info: '#06b6d4',
  warning: '#f59e0b',
  error: '#ef4444',
};

const CATEGORY_ICONS: Record<string, string> = {
  product_change: '📦',
  ai_optimization: '🤖',
  cron_run: '⏰',
  feed_event: '📡',
  system_event: '⚙️',
  task: '📋',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function MissionStatus({ pageName }: { pageName: string }) {
  const [now, setNow] = useState(new Date());
  const [events, setEvents] = useState<ShiftEvent[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  // Live clock — updates every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch data — on mount + every 30 seconds
  const fetchData = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [eventsRes, statsRes] = await Promise.all([
        fetch(`/api/shift-log?action=recent&since=${since}&limit=30`).then(r => r.json()).catch(() => ({ events: [] })),
        fetch('/api/shift-log?action=stats').then(r => r.json()).catch(() => null),
      ]);
      setEvents(eventsRes.events || []);
      if (statsRes?.products) setStats(statsRes);
      setLoading(false);
    } catch { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Acknowledge an event
  const acknowledge = async (eventId: string) => {
    await fetch('/api/shift-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge', ids: [eventId], acknowledged_by: 'operator' }),
    });
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, acknowledged_by: 'operator', acknowledged_at: new Date().toISOString() } : e));
  };

  const unacknowledged = events.filter(e => !e.acknowledged_by);
  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a0a12 0%, #0d1117 50%, #0a0a12 100%)',
      borderBottom: '1px solid #1a1a2e',
      padding: '12px 24px',
      fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace",
    }}>
      {/* TOP ROW — Clock + Page + Stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        {/* Left: Clock + Date + Page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
            <span style={{ fontSize: '10px', color: '#444' }}>{todayStr}</span>
          </div>
          <div style={{ width: '1px', height: '24px', background: '#1a1a2e' }} />
          <span style={{ fontSize: '11px', color: '#06b6d4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{pageName}</span>
        </div>

        {/* Center: System Stats */}
        {stats && (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>{stats.products.total.toLocaleString()}</div>
              <div style={{ fontSize: '7px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Products</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#16a34a' }}>{stats.products.feedReady.toLocaleString()}</div>
              <div style={{ fontSize: '7px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Feed Ready</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#ef4444' }}>{stats.products.feedRejected.toLocaleString()}</div>
              <div style={{ fontSize: '7px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rejected</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b' }}>{stats.products.feedPending.toLocaleString()}</div>
              <div style={{ fontSize: '7px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#8b5cf6' }}>{stats.todayEvents}</div>
              <div style={{ fontSize: '7px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Events Today</div>
            </div>
          </div>
        )}

        {/* Right: Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: '6px 14px', borderRadius: '8px', border: '1px solid #1a1a2e',
            background: unacknowledged.length > 0 ? 'rgba(245,158,11,0.1)' : 'transparent',
            color: unacknowledged.length > 0 ? '#f59e0b' : '#555',
            fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          {unacknowledged.length > 0 && (
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b',
              animation: 'pulse 2s infinite',
            }} />
          )}
          {expanded ? '▲ Collapse' : `▼ Activity Feed (${events.length})`}
          {unacknowledged.length > 0 && (
            <span style={{
              background: '#f59e0b', color: '#000', fontSize: '8px', fontWeight: 800,
              padding: '1px 6px', borderRadius: '999px',
            }}>{unacknowledged.length} new</span>
          )}
        </button>
      </div>

      {/* EXPANDED: Activity Feed */}
      {expanded && (
        <div style={{
          marginTop: '12px', maxHeight: '320px', overflowY: 'auto',
          borderTop: '1px solid #1a1a2e', paddingTop: '12px',
        }}>
          {loading && <p style={{ fontSize: '10px', color: '#444' }}>Loading activity...</p>}
          {!loading && events.length === 0 && (
            <p style={{ fontSize: '10px', color: '#333' }}>No activity in the last 24 hours.</p>
          )}
          {events.map(event => (
            <div
              key={event.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '8px 12px', marginBottom: '4px',
                borderRadius: '8px', border: '1px solid #111',
                background: event.acknowledged_by ? 'transparent' : 'rgba(245,158,11,0.03)',
                opacity: event.acknowledged_by ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {/* Icon */}
              <span style={{ fontSize: '14px', marginTop: '1px' }}>
                {CATEGORY_ICONS[event.category] || '📌'}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>{event.title}</span>
                  <span style={{
                    fontSize: '7px', padding: '1px 6px', borderRadius: '4px',
                    background: `${SEVERITY_COLORS[event.severity] || '#555'}15`,
                    color: SEVERITY_COLORS[event.severity] || '#555',
                    fontWeight: 700, textTransform: 'uppercase',
                  }}>{event.severity}</span>
                </div>
                {event.description && (
                  <p style={{ fontSize: '9px', color: '#555', margin: 0, lineHeight: '1.4' }}>
                    {event.description}
                  </p>
                )}
              </div>

              {/* Timestamp + Acknowledge */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                <span style={{ fontSize: '8px', color: '#333', fontVariantNumeric: 'tabular-nums' }}>
                  {timeAgo(event.created_at)}
                </span>
                <span style={{ fontSize: '7px', color: '#333' }}>
                  {new Date(event.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {!event.acknowledged_by ? (
                  <button
                    onClick={() => acknowledge(event.id)}
                    style={{
                      fontSize: '8px', padding: '2px 8px', borderRadius: '4px',
                      border: '1px solid #1a1a2e', background: 'transparent',
                      color: '#555', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >✓ Got it</button>
                ) : (
                  <span style={{ fontSize: '7px', color: '#16a34a' }}>✓ {event.acknowledged_by}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
