// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/gates/index.ts
// LINES: ~35
// IMPORTS FROM: ./registry.ts, ./core-gates.ts, ./google-gates.ts, lib/contracts/constants.ts
// EXPORTS TO: lib/pipeline/, UI components, Feed Bot API
// DOES: Combines all gate definitions into one array. Provides runAllGates() which runs all 10 gates on a product and returns results + score. This is the ONLY function the rest of the system calls. Nobody imports core-gates or google-gates directly.
// DOES NOT: Define gates (those are in core-gates and google-gates). Modify products. Render UI.
// BREAKS IF: Gate IDs are duplicated between core and google arrays.
// ASSUMES: coreGates and googleGates are valid GateDefinition arrays.
// LEVEL: 3 — Integrated. Single import point. Adding gate 11: create the object in the appropriate file, it automatically appears here.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import type { GateResult } from '../contracts/merchant';
import type { CleanProduct } from '../contracts/product';
import { runGates, type GateDefinition } from './registry';
import { coreGates } from './core-gates';
import { googleGates } from './google-gates';
import { FEED_SCORE_WEIGHTS } from '../contracts/constants';

// ── Combined gate array ─────────────────────────────────
// This is the single source of truth for "what gates exist."
// Adding gate 11: push to coreGates or googleGates. It appears here automatically.

export const ALL_GATES: GateDefinition[] = [...coreGates, ...googleGates];

// ── Score weight mapping (gate ID → weight) ─────────────
const SCORE_MAP: Record<string, number> = {
  titleLength: FEED_SCORE_WEIGHTS.titleCompliant,
  descClean: FEED_SCORE_WEIGHTS.descriptionClean,
  image: FEED_SCORE_WEIGHTS.hasImage,
  price: FEED_SCORE_WEIGHTS.hasPrice,
  barcode: FEED_SCORE_WEIGHTS.validGTIN,
  googleCategory: FEED_SCORE_WEIGHTS.googleCategory,
  // Brand and shipping are checked separately (not gate-based)
};

// ── The ONE function the rest of the system calls ───────

export function runAllGates(product: CleanProduct): {
  results: GateResult[];
  passCount: number;
  feedScore: number;
} {
  const { results, passCount, feedScore: gateFeedScore } = runGates(ALL_GATES, product, SCORE_MAP);

  // Add non-gate score components
  let bonus = 0;
  if (product.vendor && product.vendor !== 'Unknown') bonus += FEED_SCORE_WEIGHTS.hasBrand;
  bonus += FEED_SCORE_WEIGHTS.hasShipping; // Free shipping = always pass

  return {
    results,
    passCount,
    feedScore: Math.min(100, gateFeedScore + bonus),
  };
}

// Re-export for convenience
export type { GateDefinition } from './registry';
export { ALL_GATES as gates };
