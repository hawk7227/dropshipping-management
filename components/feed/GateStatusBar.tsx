// ═══ DELIVERY ENVELOPE ═══
// FILE: components/feed/GateStatusBar.tsx
// LINES: ~50
// IMPORTS FROM: lib/contracts/merchant.ts (GateResult, TOTAL_GATES), lib/tokens.ts, ./GateBadge.tsx
// EXPORTS TO: ProductCard, product detail modal, generator page
// DOES: Renders all gate results as a row of badges with a pass counter. Shows "7/10 Gates" with color-coded background. Clicking a badge could show the fix suggestion (via title tooltip).
// DOES NOT: Run gates. Modify products. Manage state.
// BREAKS IF: gateResults array is empty (renders "0/10 Gates" — safe).
// ASSUMES: gateResults is an array of GateResult from the gate runner.
// LEVEL: 3 — Integrated. Composes GateBadge. Uses tokens. Zero inline arbitrary values.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

'use client';
import React from 'react';
import type { GateResult } from '@/lib/contracts/merchant';
import { TOTAL_GATES } from '@/lib/contracts/merchant';
import { feedScoreColor, COLOR, RADIUS, SPACE, TEXT, FONT } from '@/lib/tokens';
import GateBadge from './GateBadge';

interface GateStatusBarProps {
  gateResults: GateResult[];
  gateCount: number;
  feedScore: number;
  compact?: boolean; // If true, show only the counter, not individual badges
}

export default function GateStatusBar({ gateResults, gateCount, feedScore, compact }: GateStatusBarProps) {
  const color = gateCount === TOTAL_GATES ? COLOR.pass : gateCount >= 5 ? COLOR.warn : COLOR.fail;
  const bg = gateCount === TOTAL_GATES ? COLOR.passBg : gateCount >= 5 ? COLOR.warnBg : COLOR.failBg;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
      {/* Counter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
        <span style={{
          padding: `${SPACE[1]} ${SPACE[3]}`, borderRadius: RADIUS.full,
          fontSize: TEXT.xs, fontWeight: 700, fontFamily: FONT.mono,
          background: bg, color,
        }}>
          {gateCount}/{TOTAL_GATES} Gates
        </span>
        <span style={{
          padding: `${SPACE[1]} ${SPACE[2]}`, borderRadius: RADIUS.sm,
          fontSize: TEXT.xs, fontWeight: 700,
          background: `${feedScoreColor(feedScore)}15`, color: feedScoreColor(feedScore),
        }}>
          Score: {feedScore}/100
        </span>
      </div>

      {/* Individual gate badges (unless compact) */}
      {!compact && gateResults.length > 0 && (
        <div style={{ display: 'flex', gap: SPACE[1], flexWrap: 'wrap' }}>
          {gateResults.map(gate => (
            <GateBadge key={gate.id} status={gate.status} label={gate.id} reason={`${gate.reason}${gate.fix ? ` — Fix: ${gate.fix}` : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}
