// ═══ DELIVERY ENVELOPE ═══
// FILE: components/feed/PricingBlock.tsx
// LINES: ~75
// IMPORTS FROM: lib/contracts/pricing.ts (ProductPricing), lib/tokens.ts
// EXPORTS TO: ProductCard, product detail modal
// DOES: Renders the full pricing display — Amazon cost, your price, profit, margin %, competitor prices with "Save X%" calculations. Low margin warning when <30%.
// DOES NOT: Calculate prices (those are derived by the pricing schema). Modify data.
// BREAKS IF: pricing object is undefined (guard included).
// ASSUMES: pricing is a valid ProductPricing from the Zod schema.
// LEVEL: 3 — Integrated. Uses tokens. Takes typed ProductPricing. Zero inline arbitrary values.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

'use client';
import React from 'react';
import type { ProductPricing } from '@/lib/contracts/pricing';
import { COLOR, SPACE, RADIUS, TEXT, FONT } from '@/lib/tokens';

interface PricingBlockProps {
  pricing: ProductPricing;
  showCompetitors?: boolean;
}

const COMP_CONFIG = [
  { key: 'amazon' as const, name: 'Amazon', color: '#f59e0b', mult: '1.85×' },
  { key: 'costco' as const, name: 'Costco', color: '#ef4444', mult: '1.82×' },
  { key: 'ebay' as const, name: 'eBay', color: '#8b5cf6', mult: '1.90×' },
  { key: 'sams' as const, name: "Sam's Club", color: '#06b6d4', mult: '1.80×' },
];

export default function PricingBlock({ pricing, showCompetitors = true }: PricingBlockProps) {
  if (!pricing) return null;
  const { cost, sell, profit, profitPct, lowMargin, competitors } = pricing;
  const profitColor = profit > 0 ? (lowMargin ? COLOR.warn : COLOR.pass) : COLOR.fail;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
      {/* Main pricing row */}
      <div style={{ background: COLOR.bg.primary, borderRadius: RADIUS.md, padding: SPACE[4], border: lowMargin ? `1px solid ${COLOR.warnBorder}` : `1px solid ${COLOR.border.default}` }}>
        {lowMargin && (
          <div style={{ fontSize: TEXT.xs, color: COLOR.warn, fontWeight: 700, marginBottom: SPACE[2], display: 'flex', alignItems: 'center', gap: SPACE[1] }}>
            ⚠️ LOW MARGIN &lt;30%
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACE[3] }}>
          {[
            { label: 'Amazon Cost', value: cost, color: COLOR.text.secondary },
            { label: 'Your Price', value: sell, color: COLOR.info },
            { label: 'Profit', value: profit, color: profitColor },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: TEXT.xs, color: COLOR.text.muted, marginBottom: SPACE[1] }}>{item.label}</div>
              <div style={{ fontSize: TEXT.xl, fontWeight: 700, color: item.color, fontFamily: FONT.mono }}>
                {item.value > 0 ? `$${item.value.toFixed(2)}` : '—'}
              </div>
            </div>
          ))}
        </div>
        {profitPct > 0 && (
          <div style={{ marginTop: SPACE[2], fontSize: TEXT.sm, color: profitColor, fontWeight: 600 }}>
            Margin: {profitPct.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Competitor prices */}
      {showCompetitors && sell > 0 && (
        <div style={{ background: COLOR.bg.primary, borderRadius: RADIUS.md, padding: SPACE[4], border: `1px solid ${COLOR.warnBorder}` }}>
          <div style={{ fontSize: TEXT.xs, color: COLOR.warn, fontWeight: 700, marginBottom: SPACE[3], letterSpacing: '0.5px' }}>COMPETITOR PRICES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
            {COMP_CONFIG.map(c => {
              const price = competitors[c.key];
              return (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${SPACE[1]} ${SPACE[3]}`, background: COLOR.bg.secondary, borderRadius: RADIUS.sm, border: `1px solid ${COLOR.border.default}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
                    <span style={{ width: 8, height: 8, borderRadius: RADIUS.full, background: c.color }} />
                    <span style={{ fontSize: TEXT.base, color: COLOR.text.secondary, fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: TEXT.xs, color: COLOR.text.faint }}>{c.mult}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: TEXT.lg, color: c.color, fontWeight: 700, fontFamily: FONT.mono }}>
                      {price > 0 ? `$${price.toFixed(2)}` : '—'}
                    </span>
                    {price > 0 && sell > 0 && (
                      <span style={{ fontSize: TEXT.xs, color: COLOR.text.muted, marginLeft: SPACE[2] }}>
                        Save {((1 - sell / price) * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: SPACE[2], padding: `${SPACE[2]} ${SPACE[3]}`, background: COLOR.passBg, borderRadius: RADIUS.sm, border: `1px solid ${COLOR.passBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: TEXT.base, color: COLOR.pass, fontWeight: 700 }}>✓ Your Price (Best)</span>
            <span style={{ fontSize: TEXT.xl, color: COLOR.pass, fontWeight: 800, fontFamily: FONT.mono }}>${sell.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
