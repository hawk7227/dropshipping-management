'use client';

// components/ai/AIToolsPanel.tsx
// AI-powered content generation, SEO analysis, and trend detection

import React, { useState, useEffect, useCallback } from 'react';

interface Product {
  id: string;
  title: string;
  description?: string;
  vendor?: string;
  product_type?: string;
  images?: Array<{ src: string }>;
}

interface AIContent {
  id: string;
  content_type: string;
  product_id?: string;
  generated_content: string;
  is_approved: boolean;
  approved_at?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

interface SEOAnalysis {
  id: string;
  product_id: string;
  title_score: number;
  description_score: number;
  overall_score: number;
  keyword_density: Record<string, number>;
  suggestions: Array<{
    type: string;
    priority: string;
    message: string;
    current?: string;
    recommended?: string;
  }>;
  created_at: string;
}

interface MarketTrend {
  id: string;
  keyword: string;
  search_volume: number;
  trend_direction: 'up' | 'down' | 'stable';
  competition_level: 'low' | 'medium' | 'high';
  related_keywords: string[];
  category?: string;
  recorded_at: string;
}

interface AIStats {
  totalGenerated: number;
  approved: number;
  pending: number;
  byType: Record<string, number>;
}

type TabType = 'generator' | 'seo' | 'trends' | 'history';
type GeneratorType = 'description' | 'seo-title' | 'meta-description' | 'hashtags';

export default function AIToolsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('generator');
  const [stats, setStats] = useState<AIStats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [aiContent, setAIContent] = useState<AIContent[]>([]);
  const [trends, setTrends] = useState<MarketTrend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generator state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [generatorType, setGeneratorType] = useState<GeneratorType>('description');
  const [generatedResult, setGeneratedResult] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  // Description options
  const [descriptionLength, setDescriptionLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [descriptionTone, setDescriptionTone] = useState<'professional' | 'casual' | 'luxury' | 'technical'>('professional');
  const [targetKeywords, setTargetKeywords] = useState('');

  // SEO state
  const [seoAnalysis, setSEOAnalysis] = useState<SEOAnalysis | null>(null);
  const [analyzingSEO, setAnalyzingSEO] = useState(false);

  // Trends state
  const [trendCategory, setTrendCategory] = useState('');
  const [analyzingTrends, setAnalyzingTrends] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/ai?action=stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?action=list&pageSize=100&status=active');
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  }, []);

  const fetchAIContent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai?action=content&limit=50');
      const data = await res.json();
      if (data.success) {
        setAIContent(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch AI content:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: 'trends', limit: '20' });
      if (trendCategory) params.set('category', trendCategory);

      const res = await fetch(`/api/ai?${params}`);
      const data = await res.json();
      if (data.success) {
        setTrends(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch trends:', err);
    } finally {
      setLoading(false);
    }
  }, [trendCategory]);

  useEffect(() => {
    fetchStats();
    fetchProducts();
  }, [fetchStats, fetchProducts]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchAIContent();
    } else if (activeTab === 'trends') {
      fetchTrends();
    }
  }, [activeTab, fetchAIContent, fetchTrends]);

  const handleGenerate = async () => {
    if (!selectedProductId) return;

    setGenerating(true);
    setGeneratedResult('');
    setError(null);

    try {
      let endpoint = '';
      let body: Record<string, any> = { productId: selectedProductId };

      switch (generatorType) {
        case 'description':
          endpoint = '/api/ai?action=description';
          body.length = descriptionLength;
          body.tone = descriptionTone;
          if (targetKeywords) {
            body.keywords = targetKeywords.split(',').map(k => k.trim()).filter(Boolean);
          }
          break;
        case 'seo-title':
          endpoint = '/api/ai?action=seo-title';
          if (targetKeywords) {
            body.keywords = targetKeywords.split(',').map(k => k.trim()).filter(Boolean);
          }
          break;
        case 'meta-description':
          endpoint = '/api/ai?action=meta-description';
          if (targetKeywords) {
            body.keywords = targetKeywords.split(',').map(k => k.trim()).filter(Boolean);
          }
          break;
        case 'hashtags':
          endpoint = '/api/social?action=generate-hashtags';
          body.count = 15;
          break;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        if (generatorType === 'hashtags') {
          setGeneratedResult(data.data.join(' '));
        } else {
          setGeneratedResult(data.data);
        }
        fetchStats();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAnalyzeSEO = async () => {
    if (!selectedProductId) return;

    setAnalyzingSEO(true);
    setSEOAnalysis(null);
    setError(null);

    try {
      const body: Record<string, any> = { productId: selectedProductId };
      if (targetKeywords) {
        body.keywords = targetKeywords.split(',').map(k => k.trim()).filter(Boolean);
      }

      const res = await fetch('/api/ai?action=analyze-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        setSEOAnalysis(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('SEO analysis failed. Please try again.');
    } finally {
      setAnalyzingSEO(false);
    }
  };

  const handleAnalyzeTrends = async () => {
    setAnalyzingTrends(true);
    setError(null);

    try {
      const res = await fetch('/api/ai?action=analyze-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: trendCategory || undefined }),
      });

      const data = await res.json();
      if (data.success) {
        setTrends(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Trend analysis failed. Please try again.');
    } finally {
      setAnalyzingTrends(false);
    }
  };

  const handleApproveContent = async (contentId: string) => {
    try {
      const res = await fetch('/api/ai?action=approve-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId }),
      });

      const data = await res.json();
      if (data.success) {
        fetchAIContent();
        fetchStats();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to approve content');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTrendIcon = (direction: string) => {
    if (direction === 'up') return '📈';
    if (direction === 'down') return '📉';
    return '➡️';
  };

  const getCompetitionColor = (level: string) => {
    if (level === 'low') return 'bg-green-100 text-green-700';
    if (level === 'medium') return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">AI Tools</h2>
            <p className="text-sm text-gray-500 mt-1">
              Generate content, optimize SEO, and discover market trends
            </p>
          </div>
          {stats && (
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-2xl font-semibold text-gray-900">{stats.totalGenerated}</p>
                <p className="text-gray-500">Generated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-green-600">{stats.approved}</p>
                <p className="text-gray-500">Approved</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-yellow-600">{stats.pending}</p>
                <p className="text-gray-500">Pending</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['generator', 'seo', 'trends', 'history'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'seo' ? 'SEO Analysis' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Generator Tab */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-2 gap-6">
            {/* Options Panel */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Product
                </label>
                <select
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Choose a product...</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'description', label: 'Product Description' },
                    { value: 'seo-title', label: 'SEO Title' },
                    { value: 'meta-description', label: 'Meta Description' },
                    { value: 'hashtags', label: 'Hashtags' },
                  ].map(type => (
                    <button
                      key={type.value}
                      onClick={() => setGeneratorType(type.value as GeneratorType)}
                      className={`px-4 py-3 text-sm font-medium rounded-lg border transition-colors ${
                        generatorType === type.value
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {generatorType === 'description' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Length
                    </label>
                    <div className="flex gap-2">
                      {(['short', 'medium', 'long'] as const).map(length => (
                        <button
                          key={length}
                          onClick={() => setDescriptionLength(length)}
                          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${
                            descriptionLength === length
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {length}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tone
                    </label>
                    <select
                      value={descriptionTone}
                      onChange={e => setDescriptionTone(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="luxury">Luxury</option>
                      <option value="technical">Technical</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Keywords (optional)
                </label>
                <input
                  type="text"
                  value={targetKeywords}
                  onChange={e => setTargetKeywords(e.target.value)}
                  placeholder="keyword1, keyword2, keyword3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">Separate keywords with commas</p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!selectedProductId || generating}
                className="w-full py-3 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    Generating...
                  </span>
                ) : (
                  'Generate Content'
                )}
              </button>
            </div>

            {/* Result Panel */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Generated Content
                </label>
                {generatedResult && (
                  <button
                    onClick={() => copyToClipboard(generatedResult)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Copy
                  </button>
                )}
              </div>
              <div className="h-96 border border-gray-200 rounded-lg p-4 bg-gray-50 overflow-y-auto">
                {generatedResult ? (
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: generatedResult }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    <p>Generated content will appear here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SEO Tab */}
        {activeTab === 'seo' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Product
                </label>
                <select
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Choose a product...</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Keywords
                </label>
                <input
                  type="text"
                  value={targetKeywords}
                  onChange={e => setTargetKeywords(e.target.value)}
                  placeholder="keyword1, keyword2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAnalyzeSEO}
                  disabled={!selectedProductId || analyzingSEO}
                  className="w-full py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyzingSEO ? 'Analyzing...' : 'Analyze SEO'}
                </button>
              </div>
            </div>

            {seoAnalysis && (
              <div className="space-y-6">
                {/* Score Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <div className="relative w-24 h-24 mx-auto mb-4">
                      <svg className="w-24 h-24 transform -rotate-90">
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          className="fill-none stroke-gray-200"
                          strokeWidth="8"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          className={`fill-none ${getScoreBgColor(seoAnalysis.overall_score).replace('bg-', 'stroke-')}`}
                          strokeWidth="8"
                          strokeDasharray={`${(seoAnalysis.overall_score / 100) * 251} 251`}
                        />
                      </svg>
                      <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${getScoreColor(seoAnalysis.overall_score)}`}>
                        {seoAnalysis.overall_score}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">Overall Score</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <p className={`text-4xl font-bold ${getScoreColor(seoAnalysis.title_score)}`}>
                      {seoAnalysis.title_score}
                    </p>
                    <p className="font-medium text-gray-900 mt-2">Title Score</p>
                    <p className="text-sm text-gray-500">Optimal: 80+</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <p className={`text-4xl font-bold ${getScoreColor(seoAnalysis.description_score)}`}>
                      {seoAnalysis.description_score}
                    </p>
                    <p className="font-medium text-gray-900 mt-2">Description Score</p>
                    <p className="text-sm text-gray-500">Optimal: 80+</p>
                  </div>
                </div>

                {/* Keyword Density */}
                {Object.keys(seoAnalysis.keyword_density).length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">Keyword Density</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {Object.entries(seoAnalysis.keyword_density).map(([keyword, density]) => (
                        <div key={keyword} className="bg-gray-50 rounded-lg p-3">
                          <p className="font-medium text-gray-900 truncate">{keyword}</p>
                          <p className={`text-lg font-semibold ${
                            density >= 1 && density <= 3
                              ? 'text-green-600'
                              : density > 3
                              ? 'text-red-600'
                              : 'text-yellow-600'
                          }`}>
                            {density.toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-500">Ideal: 1-3%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {seoAnalysis.suggestions.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">Suggestions</h3>
                    <div className="space-y-3">
                      {seoAnalysis.suggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-lg border ${
                            suggestion.priority === 'high'
                              ? 'border-red-200 bg-red-50'
                              : suggestion.priority === 'medium'
                              ? 'border-yellow-200 bg-yellow-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded uppercase ${
                                  suggestion.priority === 'high'
                                    ? 'bg-red-100 text-red-700'
                                    : suggestion.priority === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {suggestion.priority}
                                </span>
                                <span className="text-xs text-gray-500 capitalize">{suggestion.type}</span>
                              </div>
                              <p className="text-sm text-gray-900">{suggestion.message}</p>
                              {suggestion.recommended && (
                                <p className="text-sm text-green-600 mt-1">
                                  Suggested: {suggestion.recommended}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Trends Tab */}
        {activeTab === 'trends' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={trendCategory}
                  onChange={e => setTrendCategory(e.target.value)}
                  placeholder="Enter category (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <button
                onClick={handleAnalyzeTrends}
                disabled={analyzingTrends}
                className="px-6 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzingTrends ? 'Analyzing...' : 'Analyze Trends'}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : trends.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No trends found</p>
                <p className="text-sm mt-1">Click "Analyze Trends" to discover market trends</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {trends.map(trend => (
                  <div
                    key={trend.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getTrendIcon(trend.trend_direction)}</span>
                        <h3 className="font-medium text-gray-900">{trend.keyword}</h3>
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${getCompetitionColor(trend.competition_level)}`}>
                        {trend.competition_level}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                      <span>{trend.search_volume.toLocaleString()} searches/mo</span>
                      {trend.category && <span className="text-gray-400">· {trend.category}</span>}
                    </div>
                    {trend.related_keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {trend.related_keywords.slice(0, 5).map((kw, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                          >
                            {kw}
                          </span>
                        ))}
                        {trend.related_keywords.length > 5 && (
                          <span className="text-xs text-gray-400">
                            +{trend.related_keywords.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : aiContent.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No AI-generated content yet</p>
                <button
                  onClick={() => setActiveTab('generator')}
                  className="mt-2 text-sm text-gray-900 underline"
                >
                  Generate your first content
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {aiContent.map(content => (
                  <div
                    key={content.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded capitalize">
                          {content.content_type}
                        </span>
                        {content.is_approved ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                            Approved
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
                            Pending
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(content.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div
                      className="text-sm text-gray-700 line-clamp-3 mb-3"
                      dangerouslySetInnerHTML={{ __html: content.generated_content }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(content.generated_content.replace(/<[^>]*>/g, ''))}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        Copy
                      </button>
                      {!content.is_approved && (
                        <button
                          onClick={() => handleApproveContent(content.id)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
