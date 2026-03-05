// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/contracts/merchant.ts
// LINES: 78
// IMPORTS FROM: zod
// EXPORTS TO: lib/contracts/product.ts, lib/gates/, lib/pipeline/, UI components
// DOES: Defines Google Merchant Center compliance fields. Gate results stored as a typed array of { id, status, reason, fix }. Feed score 0-100. Google Product Category. SEO title/description. Condition and availability as enums (not freeform strings).
// DOES NOT: Run gate checks (that's lib/gates/). Generate feed XML. Call Google APIs.
// BREAKS IF: zod not installed. Gate ID not in the allowed list (enum enforces this).
// ASSUMES: Gate results are populated by the gate registry runner, not manually.
// LEVEL: 3 — Integrated. Availability and condition are enums, not arbitrary strings. Gate results are structured, not a flat object.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Gate types ──────────────────────────────────────────

export const GateStatusEnum = z.enum(['pass', 'fail', 'warn']);
export type GateStatus = z.infer<typeof GateStatusEnum>;

export const GateIdEnum = z.enum([
  'title', 'image', 'price', 'asin', 'description',
  'googleCategory', 'titleLength', 'descClean', 'barcode', 'identifier',
]);
export type GateId = z.infer<typeof GateIdEnum>;

export const GateResultSchema = z.object({
  id: GateIdEnum,
  status: GateStatusEnum,
  reason: z.string(),                    // "Title is 163 chars (max 150)"
  fix: z.string().default(''),           // "Trim title to 150 chars using Brand + Type + Feature formula"
});
export type GateResult = z.infer<typeof GateResultSchema>;

export const TOTAL_GATES = 10;
export const ALL_GATE_IDS: GateId[] = GateIdEnum.options;

// ── Google Merchant fields ──────────────────────────────

export const AvailabilityEnum = z.enum(['in stock', 'out of stock', 'preorder']);
export const ConditionEnum = z.enum(['new', 'refurbished', 'used']);

export const MerchantFeedStatusSchema = z.object({
  googleCategory: z.string().trim().default(''),
  seoTitle: z.string().trim().default(''),
  seoDescription: z.string().trim().default(''),
  weight: z.string().trim().default(''),
  condition: ConditionEnum.default('new'),
  availability: AvailabilityEnum.default('in stock'),

  // Gate results — populated by the gate runner, not manually set
  gateResults: z.array(GateResultSchema).default([]),
  gateCount: z.number().min(0).max(TOTAL_GATES).default(0),
  feedScore: z.number().min(0).max(100).default(0),
});

export type MerchantFeedStatus = z.infer<typeof MerchantFeedStatusSchema>;

// ── Factory for empty gate results ──────────────────────

export function createEmptyGateResults(): GateResult[] {
  return ALL_GATE_IDS.map(id => ({
    id,
    status: 'fail' as const,
    reason: 'Not checked',
    fix: '',
  }));
}
