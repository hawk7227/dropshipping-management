'use client';

// components/products/GoogleStatusBadge.tsx
// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SHOPPING STATUS BADGE — Spec Item 32
// Shows optimization status: Optimized | Pending | Not Synced
// Based on shopify_product_id (synced?) and google metafield (optimized?)
// ═══════════════════════════════════════════════════════════════════════════

import type { Product } from '@/types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type GoogleStatus = 'optimized' | 'pending' | 'not-synced';

interface GoogleStatusBadgeProps {
  product: Product;
  /** Compact mode for card view (just icon + short label) */
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS LOGIC
// ═══════════════════════════════════════════════════════════════════════════

function getGoogleStatus(product: Product): GoogleStatus {
  // Not synced to Shopify at all — can't be on Google Shopping
  if (!product.shopify_product_id && !product.shopify_id) {
    return 'not-synced';
  }

  // Check if product has images + pricing (minimum for Google Shopping)
  const hasImage = !!(product.image_url || (product.images && product.images.length > 0));
  const hasPrice = !!(product.retail_price && product.retail_price > 0);
  const hasTitle = !!(product.title && product.title.length > 10);

  // If product is synced to Shopify AND has all required fields, it's at least pending
  // The google-shopping cron marks products as optimized via Shopify metafields
  // We check if the product has competitive pricing data (indicates optimization ran)
  const hasCompetitorPrices = !!(
    product.amazon_display_price ||
    product.costco_display_price ||
    product.ebay_display_price ||
    product.sams_display_price ||
    product.competitor_prices
  );

  if (hasImage && hasPrice && hasTitle && hasCompetitorPrices) {
    return 'optimized';
  }

  return 'pending';
}

// ═══════════════════════════════════════════════════════════════════════════
// BADGE CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<GoogleStatus, {
  label: string;
  shortLabel: string;
  className: string;
  dotColor: string;
  tooltip: string;
}> = {
  'optimized': {
    label: 'Google Optimized',
    shortLabel: 'GMC',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-500',
    tooltip: 'Product is optimized for Google Merchant Center free listings',
  },
  'pending': {
    label: 'GMC Pending',
    shortLabel: 'Pending',
    className: 'bg-amber-50 text-amber-600 border-amber-200',
    dotColor: 'bg-amber-400',
    tooltip: 'Synced to Shopify but missing optimization data (images, competitor pricing, or title length)',
  },
  'not-synced': {
    label: 'Not Synced',
    shortLabel: 'No GMC',
    className: 'bg-gray-50 text-gray-400 border-gray-200',
    dotColor: 'bg-gray-300',
    tooltip: 'Not synced to Shopify — sync first to enable Google Shopping',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GoogleStatusBadge({ product, compact = false }: GoogleStatusBadgeProps) {
  const status = getGoogleStatus(product);
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${config.className}`}
      title={config.tooltip}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotColor}`} />
      {compact ? config.shortLabel : config.label}
    </span>
  );
}

// Export the status function for use in filtering
export { getGoogleStatus };
export type { GoogleStatus };

export default GoogleStatusBadge;
