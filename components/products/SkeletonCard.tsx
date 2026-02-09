'use client';

// components/products/SkeletonCard.tsx
// PRODUCTION loading skeleton components that match the ProductCard layout
// Includes: SkeletonCard (single), SkeletonStats (stats row), SkeletonGrid (full page)
// Uses staggered animation delays for visual polish
// NEW FILE — does not modify any existing files

import type { GridDensity } from './ViewToggle';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SkeletonCardProps {
  /** Stagger index for animation delay */
  index?: number;
  className?: string;
}

interface SkeletonGridProps {
  /** Number of skeleton cards to show */
  count?: number;
  /** Grid density (columns) */
  density?: GridDensity;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHIMMER BLOCK HELPER
// Applies a staggered animation delay based on index for visual polish
// ═══════════════════════════════════════════════════════════════════════════

function Shimmer({
  className,
  delay = 0,
}: {
  className: string;
  delay?: number;
}) {
  return (
    <div
      className={`bg-gray-200 rounded animate-pulse ${className}`}
      style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE SKELETON CARD
// Matches ProductCard layout: image → title → ASIN/status → prices → actions
// ═══════════════════════════════════════════════════════════════════════════

export function SkeletonCard({ index = 0, className = '' }: SkeletonCardProps) {
  // Stagger delay: each card starts its pulse slightly later
  const baseDelay = (index % 8) * 75;

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Image placeholder */}
      <Shimmer className="h-48 w-full rounded-none" delay={baseDelay} />

      {/* Content */}
      <div className="p-3 space-y-2.5">
        {/* Title — two lines */}
        <div className="space-y-1.5">
          <Shimmer className="h-4 w-full" delay={baseDelay + 50} />
          <Shimmer className="h-4 w-3/4" delay={baseDelay + 100} />
        </div>

        {/* ASIN + status badge row */}
        <div className="flex items-center justify-between">
          <Shimmer className="h-3 w-24" delay={baseDelay + 150} />
          <Shimmer className="h-5 w-16 rounded-full" delay={baseDelay + 150} />
        </div>

        {/* Rating row */}
        <div className="flex items-center gap-1">
          <Shimmer className="h-3 w-20" delay={baseDelay + 175} />
          <Shimmer className="h-3 w-12" delay={baseDelay + 175} />
        </div>

        {/* Price row — Cost / Sell / Profit */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
          <div className="space-y-1">
            <Shimmer className="h-2.5 w-8" delay={baseDelay + 200} />
            <Shimmer className="h-5 w-14" delay={baseDelay + 225} />
          </div>
          <div className="space-y-1">
            <Shimmer className="h-2.5 w-8" delay={baseDelay + 200} />
            <Shimmer className="h-5 w-14" delay={baseDelay + 225} />
          </div>
          <div className="space-y-1 flex flex-col items-end">
            <Shimmer className="h-2.5 w-8" delay={baseDelay + 200} />
            <Shimmer className="h-5 w-12 rounded" delay={baseDelay + 250} />
          </div>
        </div>

        {/* Sync status row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <Shimmer className="h-3 w-16" delay={baseDelay + 275} />
          <Shimmer className="h-3 w-20" delay={baseDelay + 275} />
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
          <Shimmer className="h-7 flex-1 rounded-md" delay={baseDelay + 300} />
          <Shimmer className="h-7 w-7 rounded-md" delay={baseDelay + 325} />
          <Shimmer className="h-7 w-7 rounded-md" delay={baseDelay + 350} />
          <Shimmer className="h-7 w-7 rounded-md" delay={baseDelay + 375} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON STATS ROW
// Matches the 6-card stats row (Total, Active, Paused, Low Margin, etc.)
// ═══════════════════════════════════════════════════════════════════════════

export function SkeletonStats() {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      aria-busy="true"
      aria-label="Loading statistics"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-gray-200 p-4"
          aria-hidden="true"
        >
          <Shimmer className="h-7 w-16 mb-2" delay={i * 50} />
          <Shimmer className="h-3 w-24" delay={i * 50 + 25} />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON HEADER
// Matches the page header (title + buttons)
// ═══════════════════════════════════════════════════════════════════════════

export function SkeletonHeader() {
  return (
    <div className="flex items-center justify-between" aria-hidden="true">
      <div className="space-y-2">
        <Shimmer className="h-8 w-48" />
        <Shimmer className="h-4 w-72" delay={50} />
      </div>
      <div className="flex items-center gap-3">
        <Shimmer className="h-10 w-28 rounded-lg" delay={75} />
        <Shimmer className="h-10 w-32 rounded-lg" delay={100} />
        <Shimmer className="h-10 w-36 rounded-lg" delay={125} />
        <Shimmer className="h-10 w-24 rounded-lg" delay={150} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON GRID (full loading page — multiple skeleton cards in a grid)
// ═══════════════════════════════════════════════════════════════════════════

const GRID_COLS: Record<GridDensity, string> = {
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
};

export function SkeletonGrid({
  count = 12,
  density = 4,
  className = '',
}: SkeletonGridProps) {
  return (
    <div
      className={`grid ${GRID_COLS[density]} gap-4 ${className}`}
      aria-busy="true"
      aria-label="Loading products"
      role="list"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} role="listitem">
          <SkeletonCard index={i} />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL PAGE SKELETON (header + stats + grid combined)
// Use this for the initial page load before any data arrives
// ═══════════════════════════════════════════════════════════════════════════

export function SkeletonProductsPage({ density = 4 }: { density?: GridDensity }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading products page">
      <SkeletonHeader />
      <SkeletonStats />
      <SkeletonGrid count={density * 3} density={density} />
    </div>
  );
}

export default SkeletonCard;
