'use client';

// app/channels/page.tsx
// Multi-channel commerce page with unified order management

import React, { Suspense, useState } from 'react';
import ChannelsPanelFull from '@/components/channels/ChannelsPanelFull';

function ChannelsPageContent() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Sales Channels</h1>
          <p className="text-gray-600 mt-2">
            Manage your multi-channel selling across Shopify, eBay, TikTok, and Google Shopping
          </p>
        </div>
        
        <ChannelsPanelFull key={refreshTrigger} onRefresh={handleRefresh} />
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
