'use client';

// components/dashboard/ContentPerformanceDashboard.tsx
// ============================================================================
// AI CONTENT PERFORMANCE DASHBOARD
// View all posts, performance metrics, daily reports, and AI learnings
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface Post {
  id: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter';
  content: string;
  hashtags: string[];
  media_urls: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  quality_score?: number;
  predicted_engagement?: number;
  patterns_used?: string[];
  ai_generated: boolean;
  scheduled_for?: string;
  published_at?: string;
  created_at: string;
  performance?: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagement_rate: number;
    clicks: number;
  };
}

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
  brand_name: string;
  voice_tone: string;
  personality_traits: string[];
  emoji_usage: string;
  target_audience: string;
}

type TabType = 'overview' | 'posts' | 'reports' | 'patterns' | 'settings';

// ============================================================================
// PLATFORM CONFIG
// ============================================================================

const PLATFORM_CONFIG: Record<string, { color: string; icon: string; name: string }> = {
  instagram: { color: 'bg-gradient-to-r from-purple-500 to-pink-500', icon: '📷', name: 'Instagram' },
  facebook: { color: 'bg-blue-600', icon: '📘', name: 'Facebook' },
  tiktok: { color: 'bg-black', icon: '🎵', name: 'TikTok' },
  twitter: { color: 'bg-sky-500', icon: '🐦', name: 'Twitter' },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ContentPerformanceDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [posts, setPosts] = useState<Post[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [patterns, setPatterns] = useState<WinningPattern[]>([]);
  const [brandGuide, setBrandGuide] = useState<BrandGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  
  // Filters
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('7d');

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, reportsRes, patternsRes, brandRes] = await Promise.all([
        fetch('/api/content-brain?action=posts&limit=50'),
        fetch('/api/content-brain?action=reports&limit=7'),
        fetch('/api/content-brain?action=patterns'),
        fetch('/api/content-brain?action=brand-guide'),
      ]);

      const postsData = await postsRes.json();
      const reportsData = await reportsRes.json();
      const patternsData = await patternsRes.json();
      const brandData = await brandRes.json();

      if (postsData.success) setPosts(postsData.data);
      if (reportsData.success) setReports(reportsData.data);
      if (patternsData.success) setPatterns(patternsData.data);
      if (brandData.success) setBrandGuide(brandData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const filteredPosts = posts.filter(post => {
    if (platformFilter !== 'all' && post.platform !== platformFilter) return false;
    if (statusFilter !== 'all' && post.status !== statusFilter) return false;
    return true;
  });

  const todayReport = reports[0];
  
  const totalImpressions = posts.reduce((sum, p) => sum + (p.performance?.impressions || 0), 0);
  const totalEngagement = posts.reduce((sum, p) => sum + (p.performance?.likes || 0) + (p.performance?.comments || 0), 0);
  const avgEngagementRate = totalImpressions > 0 ? (totalEngagement / totalImpressions) * 100 : 0;

  const platformStats = Object.keys(PLATFORM_CONFIG).map(platform => {
    const platformPosts = posts.filter(p => p.platform === platform && p.status === 'published');
    const impressions = platformPosts.reduce((sum, p) => sum + (p.performance?.impressions || 0), 0);
    const engagement = platformPosts.reduce((sum, p) => sum + (p.performance?.likes || 0) + (p.performance?.comments || 0), 0);
    return {
      platform,
      posts: platformPosts.length,
      impressions,
      engagement,
      rate: impressions > 0 ? (engagement / impressions) * 100 : 0,
    };
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Content Performance Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">AI-powered content analytics and self-learning insights</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              <button
                onClick={fetchOverviewData}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6">
            {(['overview', 'posts', 'reports', 'patterns', 'settings'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="Total Posts"
                    value={posts.filter(p => p.status === 'published').length}
                    subtitle="Published"
                    trend={todayReport?.posts_published || 0}
                    trendLabel="today"
                  />
                  <StatCard
                    title="Total Impressions"
                    value={formatNumber(totalImpressions)}
                    subtitle="All platforms"
                    trend={todayReport?.total_impressions || 0}
                    trendLabel="today"
                  />
                  <StatCard
                    title="Total Engagement"
                    value={formatNumber(totalEngagement)}
                    subtitle="Likes + Comments"
                    trend={todayReport?.total_engagement || 0}
                    trendLabel="today"
                  />
                  <StatCard
                    title="Avg Engagement Rate"
                    value={`${avgEngagementRate.toFixed(2)}%`}
                    subtitle="Industry avg: 2.5%"
                    trend={todayReport?.avg_engagement_rate || 0}
                    trendLabel="today"
                    highlight={avgEngagementRate > 2.5}
                  />
                </div>

                {/* Platform Breakdown */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {platformStats.map((stat) => (
                      <div key={stat.platform} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-8 h-8 rounded-lg ${PLATFORM_CONFIG[stat.platform].color} flex items-center justify-center text-white text-sm`}>
                            {PLATFORM_CONFIG[stat.platform].icon}
                          </span>
                          <span className="font-medium text-gray-900">{PLATFORM_CONFIG[stat.platform].name}</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Posts</span>
                            <span className="font-medium">{stat.posts}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Impressions</span>
                            <span className="font-medium">{formatNumber(stat.impressions)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Eng. Rate</span>
                            <span className={`font-medium ${stat.rate > 2.5 ? 'text-green-600' : ''}`}>
                              {stat.rate.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Today's Report */}
                {todayReport && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      📊 Today's AI Report ({todayReport.date})
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Insights */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">💡 Key Insights</h4>
                        <ul className="space-y-2">
                          {todayReport.insights?.map((insight, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                              <span className="text-green-500 mt-0.5">✓</span>
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Improvement Plan */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">🎯 Improvement Plan</h4>
                        <ul className="space-y-2">
                          {todayReport.improvement_plan?.map((item, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                              <span className="text-blue-500 mt-0.5">→</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Tomorrow's Strategy */}
                    {todayReport.next_day_strategy && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-900 mb-1">🚀 Tomorrow's Strategy</h4>
                        <p className="text-sm text-gray-600">{todayReport.next_day_strategy}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Top Patterns */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">🏆 Winning Patterns (AI Learned)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {patterns.slice(0, 6).map((pattern) => (
                      <div key={pattern.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                            {pattern.pattern_type.toUpperCase()}
                          </span>
                          <span className={`text-xs font-medium ${
                            pattern.confidence_score >= 80 ? 'text-green-600' :
                            pattern.confidence_score >= 60 ? 'text-yellow-600' : 'text-gray-500'
                          }`}>
                            {pattern.confidence_score}% confidence
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{pattern.pattern_description}</p>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Avg engagement: {pattern.avg_engagement_rate}%</span>
                          <span>{pattern.sample_size} samples</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Posts Tab */}
            {activeTab === 'posts' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex gap-4 items-center">
                  <select
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Platforms</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="tiktok">TikTok</option>
                    <option value="twitter">Twitter</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="draft">Draft</option>
                  </select>
                  <span className="text-sm text-gray-500">
                    {filteredPosts.length} posts
                  </span>
                </div>

                {/* Posts Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onClick={() => setSelectedPost(post)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && (
              <div className="space-y-4">
                {reports.map((report) => (
                  <ReportCard key={report.date} report={report} />
                ))}
              </div>
            )}

            {/* Patterns Tab */}
            {activeTab === 'patterns' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">All Discovered Patterns</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Type</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Platform</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Pattern</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Avg Eng.</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Confidence</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Samples</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patterns.map((pattern) => (
                          <tr key={pattern.id} className="border-b border-gray-100">
                            <td className="py-3 px-4">
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                                {pattern.pattern_type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm">{pattern.platform}</td>
                            <td className="py-3 px-4 text-sm text-gray-600 max-w-xs truncate">
                              {pattern.pattern_description}
                            </td>
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
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && brandGuide && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Brand Style Guide</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                    <input
                      type="text"
                      defaultValue={brandGuide.brand_name}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Voice & Tone</label>
                    <input
                      type="text"
                      defaultValue={brandGuide.voice_tone}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
                    <input
                      type="text"
                      defaultValue={brandGuide.target_audience}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Emoji Usage</label>
                    <select
                      defaultValue={brandGuide.emoji_usage}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="heavy">Heavy</option>
                      <option value="moderate">Moderate</option>
                      <option value="minimal">Minimal</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Personality Traits</label>
                    <input
                      type="text"
                      defaultValue={brandGuide.personality_traits?.join(', ')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="approachable, expert, trustworthy"
                    />
                  </div>
                </div>
                <div className="mt-6">
                  <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
                    Save Brand Guide
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  );
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  highlight,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  trend: number;
  trendLabel: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-green-300' : 'border-gray-200'}`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-green-600' : 'text-gray-900'}`}>{value}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">{subtitle}</span>
        {trend > 0 && (
          <span className="text-xs text-green-600">+{formatNumber(trend)} {trendLabel}</span>
        )}
      </div>
    </div>
  );
}

function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const config = PLATFORM_CONFIG[post.platform];
  
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded ${config.color} flex items-center justify-center text-white text-xs`}>
            {config.icon}
          </span>
          <span className="text-sm font-medium text-gray-900">{config.name}</span>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${
          post.status === 'published' ? 'bg-green-100 text-green-700' :
          post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
          post.status === 'failed' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {post.status}
        </span>
      </div>
      
      <p className="text-sm text-gray-600 line-clamp-3 mb-3">{post.content}</p>
      
      {post.performance && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>❤️ {formatNumber(post.performance.likes)}</span>
          <span>💬 {formatNumber(post.performance.comments)}</span>
          <span>📊 {post.performance.engagement_rate?.toFixed(2)}%</span>
        </div>
      )}
      
      {post.quality_score && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                post.quality_score >= 80 ? 'bg-green-500' :
                post.quality_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${post.quality_score}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">Q: {post.quality_score}</span>
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: DailyReport }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{report.date}</h3>
        <div className="flex gap-4 text-sm">
          <span className="text-gray-500">Posts: <strong>{report.posts_published}</strong></span>
          <span className="text-gray-500">Impressions: <strong>{formatNumber(report.total_impressions)}</strong></span>
          <span className="text-gray-500">Eng. Rate: <strong>{report.avg_engagement_rate?.toFixed(2)}%</strong></span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">💡 Insights</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {report.insights?.slice(0, 3).map((insight, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-green-500">•</span>
                {insight}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">🎯 Improvements</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {report.improvement_plan?.slice(0, 3).map((item, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-blue-500">→</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">🚀 Strategy</h4>
          <p className="text-sm text-gray-600">{report.next_day_strategy}</p>
        </div>
      </div>
    </div>
  );
}

function PostDetailModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const config = PLATFORM_CONFIG[post.platform];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center text-white`}>
                {config.icon}
              </span>
              <div>
                <h3 className="font-semibold text-gray-900">{config.name} Post</h3>
                <p className="text-sm text-gray-500">
                  {post.ai_generated ? '🤖 AI Generated' : '✍️ Manual'} • {post.status}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Content */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Content</h4>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
            </div>
          </div>
          
          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Hashtags</h4>
              <div className="flex flex-wrap gap-2">
                {post.hashtags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* AI Metrics */}
          {post.quality_score && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Quality Score</h4>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        post.quality_score >= 80 ? 'bg-green-500' :
                        post.quality_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${post.quality_score}%` }}
                    />
                  </div>
                  <span className="text-lg font-bold">{post.quality_score}</span>
                </div>
              </div>
              {post.predicted_engagement && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Predicted Engagement</h4>
                  <p className="text-lg font-bold">{post.predicted_engagement}%</p>
                </div>
              )}
            </div>
          )}
          
          {/* Performance */}
          {post.performance && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Actual Performance</h4>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(post.performance.impressions)}</p>
                  <p className="text-xs text-gray-500">Impressions</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(post.performance.likes)}</p>
                  <p className="text-xs text-gray-500">Likes</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(post.performance.comments)}</p>
                  <p className="text-xs text-gray-500">Comments</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{post.performance.engagement_rate?.toFixed(2)}%</p>
                  <p className="text-xs text-gray-500">Eng. Rate</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Patterns Used */}
          {post.patterns_used && post.patterns_used.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Patterns Used</h4>
              <div className="flex flex-wrap gap-2">
                {post.patterns_used.map((pattern, i) => (
                  <span key={i} className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded">
                    {pattern}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
