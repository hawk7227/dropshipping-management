// components/MissionStatus.tsx
// ═══════════════════════════════════════════════════════════
// MISSION CONTROL HERO — Full dashboard panel
// Always visible at top of Command Center + Products pages.
// Auto-refreshes every 30s. No manual updates needed.
// Shows: live clock, today's summary, pipeline health, recent activity.
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
  meta?: Record<string, unknown>;
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
  success: '#16a34a', info: '#06b6d4', warning: '#f59e0b', error: '#ef4444',
};
const SEVERITY_BG: Record<string, string> = {
  success: 'rgba(22,163,74,0.08)', info: 'rgba(6,182,212,0.08)',
  warning: 'rgba(245,158,11,0.08)', error: 'rgba(239,68,68,0.08)',
};
const CATEGORY_ICONS: Record<string, string> = {
  product_change: '📦', ai_optimization: '🤖', cron_run: '⏰',
  feed_event: '📡', system_event: '⚙️', task: '📋',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function MissionStatus({ pageName }: { pageName: string }) {
  const [now, setNow] = useState(new Date());
  const [events, setEvents] = useState<ShiftEvent[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [eventsRes, statsRes] = await Promise.all([
        fetch(`/api/shift-log?action=recent&since=${since}&limit=50`).then(r => r.json()).catch(() => ({ events: [] })),
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

  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEvents = events.filter(e => new Date(e.created_at) >= todayStart);
  const categoryCount: Record<string, number> = {};
  for (const e of todayEvents) {
    categoryCount[e.category] = (categoryCount[e.category] || 0) + 1;
  }

  const s = stats?.products;
  const feedHealthPct = s && s.total > 0 ? Math.round((s.feedReady / s.total) * 100) : 0;
  const pendingPct = s && s.total > 0 ? Math.round((s.feedPending / s.total) * 100) : 0;
  const rejectedPct = s && s.total > 0 ? Math.round((s.feedRejected / s.total) * 100) : 0;

  const nextTasks: string[] = [];
  if (s) {
    if (s.total === 0) nextTasks.push('Import products via Matrixify or Command Center');
    if (s.feedPending > 0) nextTasks.push(`Run feed compliance check on ${s.feedPending.toLocaleString()} pending products`);
    if (s.feedRejected > 0) nextTasks.push(`Fix ${s.feedRejected.toLocaleString()} rejected products (auto-fix or AI Feed Bot)`);
    if (s.feedReady > 0 && s.feedReady < s.total) nextTasks.push(`${s.feedReady.toLocaleString()} products ready — submit feed URL to Google Merchant Center`);
    if (s.feedReady === s.total && s.total > 0) nextTasks.push('All products feed-ready — submit to Google Merchant Center');
  }
  if (nextTasks.length === 0) nextTasks.push('System is up to date');

  const visibleEvents = showAllEvents ? todayEvents : todayEvents.slice(0, 5);

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a0c14 0%, #0d1420 40%, #0a1018 100%)',
      borderBottom: '1px solid #1a2540',
      padding: '24px',
      fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace",
    }}>
      {/* ROW 1: Title bar with clock */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: '#16a34a', boxShadow: '0 0 8px rgba(22,163,74,0.6)',
            animation: 'missionPulse 2s infinite',
          }} />
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>
              Mission Control — {pageName}
            </h2>
            <p style={{ fontSize: '11px', color: '#3b5a8a', margin: '2px 0 0' }}>
              Real-time system status • Auto-refreshes every 30s
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
            {timeStr}
          </div>
          <div style={{ fontSize: '11px', color: '#3b5a8a' }}>{todayStr}</div>
        </div>
      </div>

      {/* ROW 2: Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Products', value: s?.total || 0, color: '#fff', accent: '#1a2540' },
          { label: 'Active', value: s?.active || 0, color: '#06b6d4', accent: 'rgba(6,182,212,0.1)' },
          { label: 'Feed Ready', value: s?.feedReady || 0, color: '#16a34a', accent: 'rgba(22,163,74,0.1)' },
          { label: 'Rejected', value: s?.feedRejected || 0, color: '#ef4444', accent: 'rgba(239,68,68,0.1)' },
          { label: 'Pending Review', value: s?.feedPending || 0, color: '#f59e0b', accent: 'rgba(245,158,11,0.1)' },
          { label: 'Events Today', value: todayEvents.length, color: '#8b5cf6', accent: 'rgba(139,92,246,0.1)' },
        ].map(card => (
          <div key={card.label} style={{
            background: card.accent, borderRadius: '12px', padding: '16px',
            border: `1px solid ${card.color}15`, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: card.color, lineHeight: 1 }}>
              {card.value.toLocaleString()}
            </div>
            <div style={{ fontSize: '9px', color: '#4a6a9a', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '6px' }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* ROW 3: Pipeline health bar + What's Next */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Pipeline Health */}
        <div style={{ background: '#0c1220', borderRadius: '12px', padding: '16px', border: '1px solid #1a2540' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#fff', fontWeight: 700 }}>📡 Feed Pipeline Health</span>
            <span style={{
              fontSize: '20px', fontWeight: 800,
              color: feedHealthPct >= 80 ? '#16a34a' : feedHealthPct >= 50 ? '#f59e0b' : '#ef4444',
            }}>{feedHealthPct}%</span>
          </div>
          <div style={{ height: '12px', background: '#1a2540', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${feedHealthPct}%`, background: '#16a34a', transition: 'width 0.5s' }} />
            <div style={{ width: `${pendingPct}%`, background: '#f59e0b', transition: 'width 0.5s' }} />
            <div style={{ width: `${rejectedPct}%`, background: '#ef4444', transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            <span style={{ fontSize: '9px', color: '#16a34a' }}>● Ready {feedHealthPct}%</span>
            <span style={{ fontSize: '9px', color: '#f59e0b' }}>● Pending {pendingPct}%</span>
            <span style={{ fontSize: '9px', color: '#ef4444' }}>● Rejected {rejectedPct}%</span>
          </div>
        </div>

        {/* What's Next */}
        <div style={{ background: '#0c1220', borderRadius: '12px', padding: '16px', border: '1px solid #1a2540' }}>
          <span style={{ fontSize: '11px', color: '#fff', fontWeight: 700, display: 'block', marginBottom: '10px' }}>📋 What&apos;s Next</span>
          {nextTasks.map((task, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '6px 0', borderBottom: i < nextTasks.length - 1 ? '1px solid #1a2540' : 'none',
            }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i === 0 ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
                color: i === 0 ? '#06b6d4' : '#3b5a8a',
                fontSize: '9px', fontWeight: 800,
              }}>{i + 1}</span>
              <span style={{
                fontSize: '10px', lineHeight: '1.4',
                color: i === 0 ? '#fff' : '#4a6a9a',
                fontWeight: i === 0 ? 600 : 400,
              }}>{task}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROW 4: Today's Activity */}
      <div style={{ background: '#0c1220', borderRadius: '12px', padding: '16px', border: '1px solid #1a2540' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', color: '#fff', fontWeight: 700 }}>
            ⚡ Today&apos;s Activity {todayEvents.length > 0 && `(${todayEvents.length} events)`}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {Object.entries(categoryCount).map(([cat, count]) => (
              <span key={cat} style={{
                fontSize: '8px', padding: '3px 8px', borderRadius: '6px',
                background: 'rgba(255,255,255,0.05)', color: '#4a6a9a',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                {CATEGORY_ICONS[cat] || '📌'} {cat.replace('_', ' ')} <strong style={{ color: '#fff' }}>{count}</strong>
              </span>
            ))}
          </div>
        </div>

        {loading && <p style={{ fontSize: '10px', color: '#3b5a8a' }}>Loading activity...</p>}
        {!loading && todayEvents.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '24px',
            color: '#3b5a8a', fontSize: '12px',
            background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
            No activity recorded today yet. Events appear automatically as the system processes products, runs crons, and optimizes your feed.
          </div>
        )}

        {visibleEvents.map(event => (
          <div
            key={event.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '10px 12px', marginBottom: '4px', borderRadius: '8px',
              background: SEVERITY_BG[event.severity] || 'transparent',
              border: `1px solid ${SEVERITY_COLORS[event.severity] || '#1a2540'}10`,
            }}
          >
            <span style={{ fontSize: '16px', marginTop: '1px', flexShrink: 0 }}>
              {CATEGORY_ICONS[event.category] || '📌'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>{event.title}</span>
                <span style={{
                  fontSize: '7px', padding: '2px 6px', borderRadius: '4px',
                  background: `${SEVERITY_COLORS[event.severity] || '#555'}20`,
                  color: SEVERITY_COLORS[event.severity] || '#555',
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
                }}>{event.severity}</span>
              </div>
              {event.description && (
                <p style={{ fontSize: '9px', color: '#4a6a9a', margin: 0, lineHeight: '1.4' }}>
                  {event.description}
                </p>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '9px', color: '#3b5a8a', fontVariantNumeric: 'tabular-nums' }}>
                {timeAgo(event.created_at)}
              </div>
              <div style={{ fontSize: '8px', color: '#2a4a7a' }}>
                {new Date(event.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {todayEvents.length > 5 && (
          <button
            onClick={() => setShowAllEvents(!showAllEvents)}
            style={{
              width: '100%', padding: '10px', marginTop: '8px',
              borderRadius: '8px', border: '1px solid #1a2540',
              background: 'rgba(6,182,212,0.05)', color: '#06b6d4',
              fontSize: '10px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'background 0.15s',
            }}
          >
            {showAllEvents ? '▲ Show less' : `▼ Show all ${todayEvents.length} events`}
          </button>
        )}
      </div>

      <style>{`
        @keyframes missionPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
