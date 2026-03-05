// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/tokens.ts
// LINES: ~55
// IMPORTS FROM: None (leaf file)
// EXPORTS TO: Every UI component in the system
// DOES: Defines the locked design token system. Spacing scale (4-96px). Radius scale. Shadow scale. Color palette. Motion timing. All as Tailwind-compatible class strings or CSS variable values. No component may use arbitrary values.
// DOES NOT: Render anything. Contain logic. Import from other files.
// BREAKS IF: Nothing — pure constants.
// ASSUMES: Tailwind CSS is available with default utility classes.
// LEVEL: 3 — Integrated. Single source of truth for all visual values.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

// ── Spacing (px) — only these values allowed ────────────
export const SPACE = { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px', 20: '80px', 24: '96px' } as const;

// ── Radius ──────────────────────────────────────────────
export const RADIUS = { sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px', full: '999px' } as const;

// ── Shadows ─────────────────────────────────────────────
export const SHADOW = { sm: '0 4px 14px rgba(0,0,0,0.06)', md: '0 10px 30px rgba(0,0,0,0.08)', lg: '0 18px 60px rgba(0,0,0,0.10)' } as const;

// ── Motion — transform + opacity ONLY, 150-220ms ───────
export const MOTION = { fast: '150ms', base: '180ms', slow: '220ms' } as const;
export const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

// ── Colors ──────────────────────────────────────────────
export const COLOR = {
  // Backgrounds
  bg: { primary: '#0a0a0a', secondary: '#111111', tertiary: '#1a1a2e', hover: '#151515' },
  // Borders
  border: { default: '#1a1a2e', subtle: '#111111', strong: '#333333' },
  // Text
  text: { primary: '#ffffff', secondary: '#cccccc', muted: '#555555', faint: '#333333' },
  // Semantic
  pass: '#16a34a', warn: '#f59e0b', fail: '#ef4444',
  info: '#06b6d4', accent: '#7c3aed',
  // Gate status backgrounds (10% opacity)
  passBg: 'rgba(22,163,74,0.1)', warnBg: 'rgba(245,158,11,0.1)', failBg: 'rgba(239,68,68,0.1)',
  // Gate status borders (13% opacity)
  passBorder: 'rgba(22,163,74,0.13)', warnBorder: 'rgba(245,158,11,0.13)', failBorder: 'rgba(239,68,68,0.13)',
} as const;

// ── Typography ──────────────────────────────────────────
export const FONT = {
  mono: "'JetBrains Mono','SF Mono','Fira Code',monospace",
  sans: "'Inter','SF Pro Display','system-ui',sans-serif",
} as const;

export const TEXT = {
  xs: '9px', sm: '10px', base: '11px', md: '12px', lg: '13px', xl: '14px', '2xl': '16px', '3xl': '20px',
} as const;

// ── Feed score color thresholds ─────────────────────────
export function feedScoreColor(score: number): string {
  if (score >= 80) return COLOR.pass;
  if (score >= 50) return COLOR.warn;
  return COLOR.fail;
}

export function gateStatusColor(status: 'pass' | 'warn' | 'fail'): string {
  return status === 'pass' ? COLOR.pass : status === 'warn' ? COLOR.warn : COLOR.fail;
}

export function gateStatusBg(status: 'pass' | 'warn' | 'fail'): string {
  return status === 'pass' ? COLOR.passBg : status === 'warn' ? COLOR.warnBg : COLOR.failBg;
}

export function gateStatusBorder(status: 'pass' | 'warn' | 'fail'): string {
  return status === 'pass' ? COLOR.passBorder : status === 'warn' ? COLOR.warnBorder : COLOR.failBorder;
}
