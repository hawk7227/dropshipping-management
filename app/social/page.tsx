'use client';

// app/social/page.tsx
// Social & Marketing page - posts, campaigns, templates, contacts, integrations, and AI insights

import React, { Suspense } from 'react';
import SocialMarketingPanel from '@/components/social/SocialMarketingPanel';

function SocialPageContent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <SocialMarketingPanel />
      </div>
    </div>
  );
}

export default function SocialPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <SocialPageContent />
    </Suspense>
  );
}
