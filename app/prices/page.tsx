'use client';

// app/prices/page.tsx
// Price intelligence page with competitor tracking, margins, and sync

import React, { Suspense } from 'react';
import { PriceIntelligencePanel } from '@/components/price-intelligence/PriceIntelligencePanel';

function PricesPageContent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <PriceIntelligencePanel />
      </div>
    </div>
  );
}

export default function PricesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <PricesPageContent />
    </Suspense>
  );
}
