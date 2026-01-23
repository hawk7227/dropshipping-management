'use client';

// components/ai/AIToolsPanel.tsx
// AI content generation tools - user should already have this file
// This is a placeholder/stub that shows the expected interface

import React, { useState } from 'react';

interface GeneratedContent {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  hashtags: string[];
}

export default function AIToolsPanel() {
  const [loading, setLoading] = useState(false);
  const [productUrl, setProductUrl] = useState('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);

  const handleGenerate = async () => {
    if (!productUrl.trim()) return;
    
    setLoading(true);
    try {
      // Call your AI generation endpoint
      const res = await fetch('/api/ai-commander', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Generate optimized content for product: ${productUrl}`,
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedContent(data.data);
      }
    } catch (error) {
      console.error('Failed to generate:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Content Generation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🤖 AI Content Generator</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product URL or ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="Enter Shopify product URL or ID"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleGenerate}
                disabled={loading || !productUrl.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {generatedContent && (
            <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="text-xs text-gray-500 font-medium">TITLE</label>
                <p className="text-gray-900">{generatedContent.title}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">DESCRIPTION</label>
                <p className="text-gray-700 text-sm">{generatedContent.description}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">SEO TITLE</label>
                <p className="text-gray-900">{generatedContent.seoTitle}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">HASHTAGS</label>
                <div className="flex flex-wrap gap-1">
                  {generatedContent.hashtags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SEO Analysis */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 SEO Analysis</h3>
        <p className="text-gray-500 text-sm">Analyze and optimize your product listings for search engines.</p>
        <button className="mt-4 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100">
          Run SEO Audit
        </button>
      </div>

      {/* Trend Detection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📈 Trend Detection</h3>
        <p className="text-gray-500 text-sm">Discover trending products and keywords in your niche.</p>
        <button className="mt-4 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100">
          Analyze Trends
        </button>
      </div>
    </div>
  );
}
