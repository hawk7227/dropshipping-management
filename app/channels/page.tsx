'use client';

// app/channels/page.tsx
// Multi-channel commerce page with unified order management

import React, { Suspense } from 'react';
import ChannelsPanel from '@/components/channels/ChannelsPanel';

function ChannelsPageContent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <ChannelsPanel />
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <ChannelsPageContent />
    </Suspense>
  );
}
