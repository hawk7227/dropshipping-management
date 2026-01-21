'use client';

// app/analytics/page.tsx
// Analytics page with comprehensive reporting and insights

import React, { Suspense } from 'react';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';

function AnalyticsPageContent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AnalyticsPanel />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <AnalyticsPageContent />
    </Suspense>
  );
}
