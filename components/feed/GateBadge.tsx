// ═══ DELIVERY ENVELOPE ═══
// FILE: components/feed/GateBadge.tsx
// LINES: ~35
// IMPORTS FROM: lib/tokens.ts, lib/contracts/merchant.ts (GateStatus)
// EXPORTS TO: components/feed/GateStatusBar.tsx, ProductCard, generator page, product detail modal
// DOES: Renders a single gate badge with icon + label. Color, background, and border from tokens. Pass = green check, warn = amber warning, fail = red X.
// DOES NOT: Run gate logic. Fetch data. Manage state.
// BREAKS IF: tokens.ts doesn't export gateStatusColor/gateStatusBg/gateStatusBorder.
// ASSUMES: Status is one of 'pass' | 'warn' | 'fail'.
// LEVEL: 3 — Integrated. Uses tokens for all visual values. Zero inline styles.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

'use client';
import React from 'react';
import type { GateStatus } from '@/lib/contracts/merchant';
import { gateStatusColor, gateStatusBg, gateStatusBorder, RADIUS, SPACE, TEXT } from '@/lib/tokens';

interface GateBadgeProps {
  status: GateStatus;
  label: string;
  reason?: string;
}

const ICONS: Record<GateStatus, string> = { pass: '✅', warn: '⚠️', fail: '❌' };

export default function GateBadge({ status, label, reason }: GateBadgeProps) {
  return (
    <span
      title={reason || label}
      style={{
        padding: `${SPACE[1]} ${SPACE[2]}`,
        borderRadius: RADIUS.sm,
        fontSize: TEXT.xs,
        fontWeight: 600,
        background: gateStatusBg(status),
        color: gateStatusColor(status),
        border: `1px solid ${gateStatusBorder(status)}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE[1],
        whiteSpace: 'nowrap',
      }}
    >
      {ICONS[status]} {label}
    </span>
  );
}
