'use client';

// app/ai/page.tsx
// AI tools page with content generation, SEO analysis, trend detection, AI Command Center, and Content Brain

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import AIToolsPanel from '@/components/ai/AIToolsPanel';
import { AICommandCenter } from '@/components/ai/AICommandCenter';

// ============================================================================
// CONTENT BRAIN TYPES
// ============================================================================

interface DailyReport {
  date: string;
  posts_created: number;
  posts_published: number;
  total_impressions: number;
  total_engagement: number;
  avg_engagement_rate: number;
  top_performing_post: any;
  worst_performing_post: any;
  insights: string[];
  improvement_plan: string[];
  next_day_strategy: string;
}

interface WinningPattern {
  id: string;
  platform: string;
  pattern_type: string;
  pattern_description: string;
  avg_engagement_rate: number;
  confidence_score: number;
  sample_size: number;
}

interface BrandGuide {
  id?: string;
  brand_name: string;
  voice_tone: string;
  personality_traits: string[];
  emoji_usage: string;
  target_audience: string;
  content_pillars: string[];
  do_not_use: string[];
  call_to_action_style: string;
}

interface LearningStats {
  totalPosts: number;
  publishedPosts: number;
  totalImpressions: number;
  totalEngagement: number;
  avgEngagementRate: number;
  activePatterns: number;
}

// ============================================================================
// CONTENT BRAIN COMPONENT
// ============================================================================

function ContentBrainPanel() {
  const [activeView, setActiveView] = useState<'overview' | 'reports' | 'patterns' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [patterns, setPatterns] = useState<WinningPattern[]>([]);
  const [brandGuide, setBrandGuide] = useState<BrandGuide | null>(null);
  const [triggeringLearning, setTriggeringLearning] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state for brand guide
  const [brandForm, setBrandForm] = useState<BrandGuide>({
    brand_name: '',
    voice_tone: '',
    personality_traits: [],
    emoji_usage: 'moderate',
    target_audience: '',
    content_pillars: [],
    do_not_use: [],
    call_to_action_style: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, reportsRes, patternsRes, brandRes] = await Promise.all([
        fetch('/api/content-brain?action=stats&days=7'),
        fetch('/api/content-brain?action=reports&limit=7'),
        fetch('/api/content-brain?action=patterns'),
        fetch('/api/content-brain?action=brand-guide'),
      ]);

      const statsData = await statsRes.json();
      const reportsData = await reportsRes.json();
      const patternsData = await patternsRes.json();
      const brandData = await brandRes.json();

      if (statsData.success) setStats(statsData.data);
      if (reportsData.success) setReports(reportsData.data || []);
      if (patternsData.success) setPatterns(patternsData.data || []);
      if (brandData.success) {
        setBrandGuide(brandData.data);
        setBrandForm({
          brand_name: brandData.data?.brand_name || '',
          voice_tone: brandData.data?.voice_tone || '',
          personality_traits: brandData.data?.personality_traits || [],
          emoji_usage: brandData.data?.emoji_usage || 'moderate',
          target_audience: brandData.data?.target_audience || '',
          content_pillars: brandData.data?.content_pillars || [],
          do_not_use: brandData.data?.do_not_use || [],
          call_to_action_style: brandData.data?.call_to_action_style || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch content brain data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTriggerLearning = async () => {
    setTriggeringLearning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/content-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger-learning' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Discovered ${data.patterns?.length || 0} patterns!` });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to trigger learning' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to trigger learning' });
    } finally {
      setTriggeringLearning(false);
    }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setMessage(null);
    try {
      const res = await fetch('/api/content-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-report' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Report generated!' });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to generate report' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to generate report' });
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleSaveBrandGuide = async () => {
    setSavingBrand(true);
    setMessage(null);
    try {
      const res = await fetch('/api/content-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-brand-guide', guide: brandForm }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Brand guide saved!' });
        setBrandGuide(brandForm);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save brand guide' });
    } finally {
      setSavingBrand(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              🧠 AI Content Brain
              <span className="px-2 py-0.5 text-xs bg-white/20 rounded-full">Self-Learning</span>
            </h2>
            <p className="text-purple-100 text-sm mt-1">
              Learns from your content performance and improves daily
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleGenerateReport}
              disabled={generatingReport}
              className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 disabled:opacity-50 transition-colors"
            >
              {generatingReport ? '📊 Generating...' : '📊 Generate Report'}
            </button>
            <button
              onClick={handleTriggerLearning}
              disabled={triggeringLearning}
              className="px-4 py-2 bg-white text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50 disabled:opacity-50 transition-colors"
            >
              {triggeringLearning ? '🔄 Learning...' : '🧠 Trigger Learning'}
            </button>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Posts</p>
            <p className="text-2xl font-semibold text-gray-900">{stats.totalPosts}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Published</p>
            <p className="text-2xl font-semibold text-gray-900">{stats.publishedPosts}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Impressions</p>
            <p className="text-2xl font-semibold text-gray-900">{formatNumber(stats.totalImpressions)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Engagement</p>
            <p className="text-2xl font-semibold text-gray-900">{formatNumber(stats.totalEngagement)}</p>
          </div>
          <div className={`rounded-lg border p-4 ${stats.avgEngagementRate > 2.5 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500">Eng. Rate</p>
            <p className={`text-2xl font-semibold ${stats.avgEngagementRate > 2.5 ? 'text-green-600' : 'text-gray-900'}`}>
              {stats.avgEngagementRate.toFixed(2)}%
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Active Patterns</p>
            <p className="text-2xl font-semibold text-purple-600">{stats.activePatterns}</p>
          </div>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-3">
        {(['overview', 'reports', 'patterns', 'settings'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
              activeView === view ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {view === 'overview' && '📊 '}
            {view === 'reports' && '📋 '}
            {view === 'patterns' && '🏆 '}
            {view === 'settings' && '⚙️ '}
            {view}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeView === 'overview' && (
        <div className="space-y-6">
          {/* Today's Report */}
          {reports[0] && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                📊 Latest Report ({reports[0].date})
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">💡 Key Insights</h4>
                  <ul className="space-y-2">
                    {reports[0].insights?.slice(0, 4).map((insight, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        {insight}
                      </li>
                    ))}
                    {(!reports[0].insights || reports[0].insights.length === 0) && (
                      <li className="text-sm text-gray-400">No insights yet</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">🎯 Improvement Plan</h4>
                  <ul className="space-y-2">
                    {reports[0].improvement_plan?.slice(0, 4).map((item, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">→</span>
                        {item}
                      </li>
                    ))}
                    {(!reports[0].improvement_plan || reports[0].improvement_plan.length === 0) && (
                      <li className="text-sm text-gray-400">No improvements planned</li>
                    )}
                  </ul>
                </div>
              </div>
              {reports[0].next_day_strategy && (
                <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-1">🚀 Strategy</h4>
                  <p className="text-sm text-gray-600">{reports[0].next_day_strategy}</p>
                </div>
              )}
            </div>
          )}

          {/* Top Patterns */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🏆 Top Winning Patterns</h3>
            {patterns.length === 0 ? (
              <p className="text-gray-500 text-sm">No patterns discovered yet. Click "Trigger Learning" to analyze your posts.</p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {patterns.slice(0, 6).map(pattern => (
                  <div key={pattern.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium uppercase">
                        {pattern.pattern_type}
                      </span>
                      <span className={`text-xs font-medium ${
                        pattern.confidence_score >= 80 ? 'text-green-600' :
                        pattern.confidence_score >= 60 ? 'text-yellow-600' : 'text-gray-500'
                      }`}>
                        {pattern.confidence_score}% conf.
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{pattern.pattern_description}</p>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Avg: {pattern.avg_engagement_rate}%</span>
                      <span>{pattern.sample_size} samples</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* How It Works */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🔄 How the AI Brain Works</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl">📝</span>
                </div>
                <p className="text-sm font-medium text-gray-900">1. Generate</p>
                <p className="text-xs text-gray-500">AI creates content using brand voice + patterns</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl">📊</span>
                </div>
                <p className="text-sm font-medium text-gray-900">2. Track</p>
                <p className="text-xs text-gray-500">Monitor engagement on each post</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl">🧠</span>
                </div>
                <p className="text-sm font-medium text-gray-900">3. Learn</p>
                <p className="text-xs text-gray-500">Discover what works for YOUR audience</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl">📈</span>
                </div>
                <p className="text-sm font-medium text-gray-900">4. Improve</p>
                <p className="text-xs text-gray-500">Future content gets better automatically</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reports */}
      {activeView === 'reports' && (
        <div className="space-y-4">
          {reports.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No reports yet</p>
              <p className="text-sm mt-1">Reports are generated daily at 11 PM or click "Generate Report"</p>
            </div>
          ) : (
            reports.map(report => (
              <div key={report.date} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">{report.date}</h4>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>Posts: <strong>{report.posts_published}</strong></span>
                    <span>Impressions: <strong>{formatNumber(report.total_impressions)}</strong></span>
                    <span className={report.avg_engagement_rate > 2.5 ? 'text-green-600' : ''}>
                      Eng. Rate: <strong>{report.avg_engagement_rate?.toFixed(2)}%</strong>
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">INSIGHTS</p>
                    {report.insights?.map((insight, i) => (
                      <p key={i} className="text-sm text-gray-600 mb-1">• {insight}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">IMPROVEMENTS</p>
                    {report.improvement_plan?.map((item, i) => (
                      <p key={i} className="text-sm text-gray-600 mb-1">• {item}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">STRATEGY</p>
                    <p className="text-sm text-gray-600">{report.next_day_strategy}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Patterns */}
      {activeView === 'patterns' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {patterns.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No patterns discovered yet</p>
              <p className="text-sm mt-1">Click "Trigger Learning" to analyze your posts</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Platform</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Pattern</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Avg Eng.</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Samples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {patterns.map(pattern => (
                  <tr key={pattern.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{pattern.pattern_type}</span>
                    </td>
                    <td className="py-3 px-4 text-sm capitalize">{pattern.platform}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 max-w-xs truncate">{pattern.pattern_description}</td>
                    <td className="py-3 px-4 text-sm font-medium">{pattern.avg_engagement_rate}%</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              pattern.confidence_score >= 80 ? 'bg-green-500' :
                              pattern.confidence_score >= 60 ? 'bg-yellow-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${pattern.confidence_score}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{pattern.confidence_score}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{pattern.sample_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Settings */}
      {activeView === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Brand Style Guide</h3>
          <p className="text-sm text-gray-500 mb-6">Configure how the AI generates content for your brand</p>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
              <input
                type="text"
                value={brandForm.brand_name}
                onChange={e => setBrandForm(prev => ({ ...prev, brand_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Your Brand Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voice & Tone</label>
              <input
                type="text"
                value={brandForm.voice_tone}
                onChange={e => setBrandForm(prev => ({ ...prev, voice_tone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="friendly, confident, helpful"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
              <input
                type="text"
                value={brandForm.target_audience}
                onChange={e => setBrandForm(prev => ({ ...prev, target_audience: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="value-conscious shoppers 25-45"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emoji Usage</label>
              <select
                value={brandForm.emoji_usage}
                onChange={e => setBrandForm(prev => ({ ...prev, emoji_usage: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="heavy">Heavy</option>
                <option value="moderate">Moderate</option>
                <option value="minimal">Minimal</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Personality Traits</label>
              <input
                type="text"
                value={brandForm.personality_traits.join(', ')}
                onChange={e => setBrandForm(prev => ({ ...prev, personality_traits: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="approachable, expert, trustworthy, fun"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Content Pillars</label>
              <input
                type="text"
                value={brandForm.content_pillars.join(', ')}
                onChange={e => setBrandForm(prev => ({ ...prev, content_pillars: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="product showcases, tips & tricks, customer stories, behind the scenes"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">DO NOT Use (words/phrases to avoid)</label>
              <input
                type="text"
                value={brandForm.do_not_use.join(', ')}
                onChange={e => setBrandForm(prev => ({ ...prev, do_not_use: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="competitor names, clickbait, overpromising"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Call-to-Action Style</label>
              <input
                type="text"
                value={brandForm.call_to_action_style}
                onChange={e => setBrandForm(prev => ({ ...prev, call_to_action_style: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="soft sell, focus on value, invite rather than push"
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSaveBrandGuide}
              disabled={savingBrand}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {savingBrand ? 'Saving...' : 'Save Brand Guide'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

function AIPageContent() {
  const [activeTab, setActiveTab] = useState<'command' | 'brain' | 'tools'>('command');

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
              </button>
              <button
                onClick={() => setActiveTab('brain')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'brain'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                🧠 Content Brain
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
        {activeTab === 'brain' && <ContentBrainPanel />}
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
