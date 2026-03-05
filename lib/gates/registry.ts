// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/gates/registry.ts
// LINES: ~65
// IMPORTS FROM: lib/contracts/merchant.ts (GateId, GateResult, GateStatus, TOTAL_GATES)
// EXPORTS TO: lib/gates/core-gates.ts, lib/gates/google-gates.ts, lib/pipeline/, UI components
// DOES: Defines the GateDefinition interface and the gate runner. The runner takes any array of gate definitions and a product, runs them all, returns typed results. Adding a new gate = adding one object to an array. The runner doesn't know what gates exist.
// DOES NOT: Define specific gates (those are in core-gates.ts and google-gates.ts). Modify products. Call APIs.
// BREAKS IF: A gate's check function throws instead of returning a GateResult. Gate IDs are duplicated across arrays.
// ASSUMES: Gate check functions are pure — no side effects, no API calls, no state mutations.
// LEVEL: 3 — Integrated. Fully declarative. The runner is 8 lines. All complexity is in the gate definitions, not the runner.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import type { GateId, GateResult, GateStatus } from '../contracts/merchant';
import type { CleanProduct } from '../contracts/product';
import { TOTAL_GATES } from '../contracts/merchant';

// ── Gate Definition ─────────────────────────────────────
// This is the shape of every gate in the system.
// Adding gate 11: create one of these objects and push it into the array.

export interface GateDefinition {
  id: GateId;
  name: string;               // Human label: "Title Length"
  description: string;        // What it checks: "Title must be ≤150 chars with no promotional text"
  severity: 'critical' | 'major' | 'minor';  // critical = disapproval, major = reduced visibility, minor = optimization
  category: 'core' | 'google';               // Which group it belongs to
  check: (product: CleanProduct) => GateResult;
}

// ── Gate Runner ─────────────────────────────────────────
// Takes an array of gate definitions and a product.
// Returns the results array, pass count, and feed score.
// The runner does NOT know what gates exist. It just runs them.

export function runGates(
  gates: GateDefinition[],
  product: CleanProduct,
  scoreWeights?: Record<string, number>,
): { results: GateResult[]; passCount: number; feedScore: number } {
  const results: GateResult[] = [];
  let passCount = 0;
  let feedScore = 0;

  for (const gate of gates) {
    const result = gate.check(product);
    results.push(result);
    if (result.status === 'pass') {
      passCount++;
      if (scoreWeights && scoreWeights[gate.id] !== undefined) {
        feedScore += scoreWeights[gate.id];
      }
    }
  }

  return { results, passCount, feedScore };
}
