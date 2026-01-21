'use client';

// app/ai/page.tsx
// AI tools page with content generation, SEO analysis, trend detection, and AI Command Center

import React, { Suspense, useState } from 'react';
import AIToolsPanel from '@/components/ai/AIToolsPanel';
import { AICommandCenter } from '@/components/ai/AICommandCenter';

function AIPageContent() {
  const [activeTab, setActiveTab] = useState<'tools' | 'command'>('command');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header with Tabs */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold text-gray-900">AI Tools</h1>
          </div>
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              <button
                onClick={() => setActiveTab('command')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'command'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI Command Center
                <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">NEW</span>
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tools'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Content Tools
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'command' && <AICommandCenter />}
        {activeTab === 'tools' && <AIToolsPanel />}
      </div>
    </div>
  );
}

export default function AIPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <AIPageContent />
    </Suspense>
  );
}
