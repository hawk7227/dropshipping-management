// ═══ DELIVERY ENVELOPE ═══
// FILE: components/feed/FeedScoreBadge.tsx
// LINES: ~40
// IMPORTS FROM: lib/tokens.ts (feedScoreColor, COLOR, TEXT, FONT, SPACE)
// EXPORTS TO: ProductCard, generator page header, Google SEO page header
// DOES: Renders a circular SVG donut chart showing the feed health score 0-100 with token-based colors. Green ≥80, amber ≥50, red <50.
// DOES NOT: Calculate the score (that's the gate scorer). Manage state.
// BREAKS IF: Score is NaN (renders 0 — safe).
// ASSUMES: Score is 0-100 integer.
// LEVEL: 3 — Integrated. Uses tokens. Reusable anywhere a score display is needed.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

'use client';
import React from 'react';
import { feedScoreColor, COLOR, TEXT, FONT, SPACE, MOTION, EASING } from '@/lib/tokens';

interface FeedScoreBadgeProps {
  score: number;
  size?: number; // SVG size in px, default 40
  label?: string;
}

export default function FeedScoreBadge({ score, size = 40, label }: FeedScoreBadgeProps) {
  const s = Math.round(score || 0);
  const color = feedScoreColor(s);
  const r = (size / 2) - 3;
  const circ = 2 * Math.PI * r;
  const offset = circ - (s / 100) * circ;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={COLOR.border.default} strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: `stroke-dashoffset ${MOTION.slow} ${EASING}` }} />
        <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.28} fontWeight="700" fontFamily={FONT.mono} fill={color}>{s}</text>
      </svg>
      {label && (
        <div>
          <div style={{ fontSize: TEXT.md, fontWeight: 600, color: COLOR.text.secondary }}>{label}</div>
          <div style={{ fontSize: TEXT.xs, color: COLOR.text.muted }}>
            {s >= 80 ? 'Excellent' : s >= 50 ? 'Fair' : 'Needs work'}
          </div>
        </div>
      )}
    </div>
  );
}
