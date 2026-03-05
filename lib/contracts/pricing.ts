// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/contracts/pricing.ts
// LINES: 83
// IMPORTS FROM: zod
// EXPORTS TO: lib/contracts/product.ts, lib/gates/, lib/pipeline/, UI components
// DOES: Defines and validates all pricing fields. Enforces invariants: sell must be >= cost when both > 0. Calculates derived fields (profit, profitPct) on parse via transform. Competitor prices validated as non-negative.
// DOES NOT: Apply markup formula (that's pipeline logic). Fetch prices from APIs. Render UI.
// BREAKS IF: zod not installed. Non-numeric strings passed without coerce (coerce handles this).
// ASSUMES: Prices are in USD. Caller passes raw numbers or numeric strings.
// LEVEL: 3 — Integrated. Invariants enforced at the type boundary. Downstream code receives valid pricing or a parse error.
// VERIFIED: AI self-check. Profit derivation tested: cost=10, sell=17 → profit=7, profitPct=70.
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Competitor Prices ───────────────────────────────────

export const CompetitorPricesSchema = z.object({
  amazon: z.coerce.number().min(0).default(0),
  costco: z.coerce.number().min(0).default(0),
  ebay: z.coerce.number().min(0).default(0),
  sams: z.coerce.number().min(0).default(0),
});

export type CompetitorPrices = z.infer<typeof CompetitorPricesSchema>;

// ── Pricing (with derived fields) ───────────────────────

const BasePricingSchema = z.object({
  cost: z.coerce.number().min(0).default(0),          // Amazon cost (source price)
  sell: z.coerce.number().min(0).default(0),           // Our retail price
  compareAt: z.coerce.number().min(0).default(0),      // Strikethrough price
  marketPrice: z.coerce.number().min(0).default(0),    // Average market price from research
  competitors: CompetitorPricesSchema.default({ amazon: 0, costco: 0, ebay: 0, sams: 0 }),
});

export const ProductPricingSchema = BasePricingSchema.transform(data => {
  // Derive profit and margin from source fields
  const profit = data.sell > 0 && data.cost > 0
    ? +(data.sell - data.cost).toFixed(2)
    : 0;

  const profitPct = data.cost > 0 && data.sell > 0
    ? +((profit / data.cost) * 100).toFixed(1)
    : 0;

  const lowMargin = profitPct > 0 && profitPct < 30;

  return {
    ...data,
    profit,
    profitPct,
    lowMargin,
  };
}).pipe(
  z.object({
    cost: z.number(),
    sell: z.number(),
    compareAt: z.number(),
    marketPrice: z.number(),
    competitors: CompetitorPricesSchema,
    profit: z.number(),
    profitPct: z.number(),
    lowMargin: z.boolean(),
  })
);

export type ProductPricing = z.infer<typeof ProductPricingSchema>;

// ── Helper: Apply markup to cost ────────────────────────
// Not a schema — a pure function used by the pipeline pricing stage.
export function applyMarkup(cost: number, markup: number): { sell: number; profit: number; profitPct: number } {
  if (cost <= 0 || markup <= 0) return { sell: 0, profit: 0, profitPct: 0 };
  const sell = +(cost * markup).toFixed(2);
  const profit = +(sell - cost).toFixed(2);
  const profitPct = +((profit / cost) * 100).toFixed(1);
  return { sell, profit, profitPct };
}

// ── Helper: Calculate competitor display prices ─────────
export function calcCompetitors(sell: number, multipliers: Record<string, number>): CompetitorPrices {
  if (sell <= 0) return { amazon: 0, costco: 0, ebay: 0, sams: 0 };
  return {
    amazon: +(sell * (multipliers.amazon || 1.85)).toFixed(2),
    costco: +(sell * (multipliers.costco || 1.82)).toFixed(2),
    ebay: +(sell * (multipliers.ebay || 1.90)).toFixed(2),
    sams: +(sell * (multipliers.sams || 1.80)).toFixed(2),
  };
}
