'use client';

// components/social/SocialMarketingPanel.tsx
// UPDATED: Full social media and marketing management panel with AI Content Brain integration
// Includes: Zapier, AI Reports, Winning Patterns, Daily Insights, Performance Tracking

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  media_urls?: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduled_for?: string;
  published_at?: string;
  publish_method?: string;
  error_message?: string;
  quality_score?: number;
  predicted_engagement?: number;
  patterns_used?: string[];
  ai_generated?: boolean;
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    impressions?: number;
  };
  created_at: string;
}

interface Campaign {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'social';
  status: 'draft' | 'active' | 'paused' | 'completed';
  subject?: string;
  content?: string;
  sent_count: number;
  open_count: number;
  click_count: number;
  scheduled_for?: string;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  type: string;
  subject?: string;
  content: string;
}

interface Contact {
  id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tags: string[];
  is_subscribed: boolean;
  created_at: string;
}

interface Stats {
  posts: { total: number; published: number; scheduled: number };
  campaigns: { total: number; active: number };
  contacts: { total: number; subscribed: number };
  engagement?: { rate: number; impressions: number; total: number };
}

interface IntegrationSettings {
  zapier_webhook_url: string | null;
  zapier_enabled: boolean;
  connected_platforms: string[];
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
  content_pillars: string[];
  do_not_use: string[];
}

type TabType = 'posts' | 'campaigns' | 'templates' | 'contacts' | 'integrations' | 'ai-insights';

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
  facebook: 'bg-blue-600',
  twitter: 'bg-sky-500',
  tiktok: 'bg-black',
};

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📷',
  facebook: '📘',
  twitter: '🐦',
  tiktok: '🎵',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SocialMarketingPanel() {
  // Core state
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [stats, setStats] = useState<Stats | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showGenerateContent, setShowGenerateContent] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);

  // Content generation
  const [generateProductId, setGenerateProductId] = useState('');
  const [generatePlatform, setGeneratePlatform] = useState('instagram');
  const [generatedContent, setGeneratedContent] = useState('');
  const [generating, setGenerating] = useState(false);

  // New post form
  const [newPost, setNewPost] = useState({
    platform: 'instagram',
    content: '',
    scheduledFor: '',
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Zapier Integration
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>({
    zapier_webhook_url: null,
    zapier_enabled: false,
    connected_platforms: [],
  });
  const [zapierWebhookInput, setZapierWebhookInput] = useState('');
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [testingZapier, setTestingZapier] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);

  // AI Insights state (NEW)
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [winningPatterns, setWinningPatterns] = useState<WinningPattern[]>([]);
  const [brandGuide, setBrandGuide] = useState<BrandGuide | null>(null);
  const [aiInsightsView, setAiInsightsView] = useState<'overview' | 'reports' | 'patterns' | 'settings'>('overview');
  const [triggeringLearning, setTriggeringLearning] = useState(false);

  // ============================================================================
  // FETCH FUNCTIONS
  // ============================================================================

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/social?action=stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: 'posts',
        page: page.toString(),
        pageSize: '20',
      });
      if (platformFilter) params.set('platform', platformFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/social?${params}`);
      const data = await res.json();

      if (data.success) {
        setPosts(data.data);
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, [page, platformFilter, statusFilter]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: 'campaigns',
        page: page.toString(),
        pageSize: '20',
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/social?${params}`);
      const data = await res.json();

      if (data.success) {
        setCampaigns(data.data);
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/social?action=templates');
      const data = await res.json();

      if (data.success) {
        setTemplates(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: 'contacts',
        page: page.toString(),
        pageSize: '50',
      });
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/social?${params}`);
      const data = await res.json();

      if (data.success) {
        setContacts(data.data);
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/social?action=integrations');
      const data = await res.json();

      if (data.success) {
        setIntegrationSettings(data.data);
        setZapierWebhookInput(data.data.zapier_webhook_url || '');
      } else {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
      setError('Failed to fetch integration settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // NEW: Fetch AI Insights data
  const fetchAiInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportsRes, patternsRes, brandRes] = await Promise.all([
        fetch('/api/content-brain?action=reports&limit=7'),
        fetch('/api/content-brain?action=patterns'),
        fetch('/api/content-brain?action=brand-guide'),
      ]);

      const reportsData = await reportsRes.json();
      const patternsData = await patternsRes.json();
      const brandData = await brandRes.json();

      if (reportsData.success) setDailyReports(reportsData.data || []);
      if (patternsData.success) setWinningPatterns(patternsData.data || []);
      if (brandData.success) setBrandGuide(brandData.data);
    } catch (err) {
      console.error('Failed to fetch AI insights:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(1);
    if (activeTab === 'posts') fetchPosts();
    else if (activeTab === 'campaigns') fetchCampaigns();
    else if (activeTab === 'templates') fetchTemplates();
    else if (activeTab === 'contacts') fetchContacts();
    else if (activeTab === 'integrations') fetchIntegrations();
    else if (activeTab === 'ai-insights') fetchAiInsights();
  }, [activeTab, fetchPosts, fetchCampaigns, fetchTemplates, fetchContacts, fetchIntegrations, fetchAiInsights]);

  useEffect(() => {
    if (activeTab === 'posts') fetchPosts();
    else if (activeTab === 'campaigns') fetchCampaigns();
    else if (activeTab === 'contacts') fetchContacts();
  }, [page, platformFilter, statusFilter, searchQuery, activeTab, fetchPosts, fetchCampaigns, fetchContacts]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleCreatePost = async () => {
    if (!newPost.content.trim()) return;

    try {
      const res = await fetch('/api/social?action=create-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: newPost.platform,
          content: newPost.content,
          scheduledFor: newPost.scheduledFor || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreatePost(false);
        setNewPost({ platform: 'instagram', content: '', scheduledFor: '' });
        fetchPosts();
        fetchStats();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to create post');
    }
  };

  const handlePublishPost = async (postId: string) => {
    try {
      const res = await fetch('/api/social?action=publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });

      const data = await res.json();
      if (data.success) {
        fetchPosts();
        fetchStats();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to publish post');
    }
  };

  const handlePublishViaZapier = async (postId: string) => {
    if (!integrationSettings.zapier_webhook_url) {
      setError('Zapier webhook URL not configured. Go to Integrations tab to set it up.');
      return;
    }

    setPublishingPostId(postId);
    setError(null);

    try {
      const res = await fetch('/api/social?action=publish-zapier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });

      const data = await res.json();
      if (data.success) {
        fetchPosts();
        fetchStats();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to publish via Zapier');
    } finally {
      setPublishingPostId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const res = await fetch(`/api/social?action=delete-post&id=${postId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        fetchPosts();
        fetchStats();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to delete post');
    }
  };

  // NEW: AI Generate with Content Brain
  const handleAIGenerate = async () => {
    if (!generateProductId) return;

    setGenerating(true);
    setGeneratedContent('');

    try {
      // Try new Content Brain API first
      const res = await fetch('/api/content-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          platform: generatePlatform,
          product: {
            id: generateProductId,
            title: `Product ${generateProductId}`,
            description: '',
            price: 29.99,
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setGeneratedContent(data.data.content);
      } else {
        // Fallback to old endpoint
        const fallbackRes = await fetch('/api/social?action=generate-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: generateProductId,
            platform: generatePlatform,
          }),
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackData.success) {
          setGeneratedContent(fallbackData.data.content);
        } else {
          setError(fallbackData.error || data.error);
        }
      }
    } catch (err) {
      setError('Failed to generate content');
    } finally {
      setGenerating(false);
    }
  };

  const handleUseGeneratedContent = () => {
    setNewPost(prev => ({
      ...prev,
      platform: generatePlatform,
      content: generatedContent,
    }));
    setShowGenerateContent(false);
    setShowCreatePost(true);
  };

  const handleSaveIntegration = async () => {
    setSavingIntegration(true);
    setIntegrationMessage(null);

    try {
      const res = await fetch('/api/social?action=save-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zapierWebhookUrl: zapierWebhookInput || null,
          zapierEnabled: !!zapierWebhookInput,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIntegrationSettings(data.data);
        setIntegrationMessage({ type: 'success', text: 'Integration settings saved successfully!' });
      } else {
        setIntegrationMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setIntegrationMessage({ type: 'error', text: 'Failed to save integration settings' });
    } finally {
      setSavingIntegration(false);
    }
  };

  const handleTestZapier = async () => {
    if (!zapierWebhookInput) {
      setIntegrationMessage({ type: 'error', text: 'Please enter a webhook URL first' });
      return;
    }

    setTestingZapier(true);
    setIntegrationMessage(null);

    try {
      const res = await fetch('/api/social?action=test-zapier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: zapierWebhookInput }),
      });

      const data = await res.json();
      if (data.success) {
        setIntegrationMessage({ type: 'success', text: data.message });
      } else {
        setIntegrationMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setIntegrationMessage({ type: 'error', text: 'Failed to test Zapier connection' });
    } finally {
      setTestingZapier(false);
    }
  };

  // NEW: Trigger AI learning
  const handleTriggerLearning = async () => {
    setTriggeringLearning(true);
    try {
      const res = await fetch('/api/content-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger-learning' }),
      });
      const data = await res.json();
      if (data.success) {
        fetchAiInsights();
      }
    } catch (err) {
      console.error('Failed to trigger learning:', err);
    } finally {
      setTriggeringLearning(false);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  // Calculate engagement rate from posts
  const calculateEngagementRate = (): { rate: number; impressions: number; engagement: number } => {
    const publishedPosts = posts.filter(p => p.status === 'published' && p.engagement);
    if (publishedPosts.length === 0) return { rate: 0, impressions: 0, engagement: 0 };

    let totalImpressions = 0;
    let totalEngagement = 0;

    publishedPosts.forEach(post => {
      const imp = post.engagement?.impressions || 0;
      const eng = (post.engagement?.likes || 0) + (post.engagement?.comments || 0) + (post.engagement?.shares || 0);
      totalImpressions += imp;
      totalEngagement += eng;
    });

    const rate = totalImpressions > 0 ? (totalEngagement / totalImpressions) * 100 : 0;
    return { rate, impressions: totalImpressions, engagement: totalEngagement };
  };

  const engagementData = calculateEngagementRate();

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Social & Marketing</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage social media posts, email campaigns, and marketing automation
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowGenerateContent(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              AI Generate
            </button>
            <button
              onClick={() => activeTab === 'posts' ? setShowCreatePost(true) : setShowCreateCampaign(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
            >
              {activeTab === 'posts' ? 'New Post' : activeTab === 'campaigns' ? 'New Campaign' : 'Create New'}
            </button>
          </div>
        </div>

        {/* Stats - UPDATED with real engagement rate */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Total Posts</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.posts.total}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.posts.published} published, {stats.posts.scheduled} scheduled
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Campaigns</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.campaigns.total}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.campaigns.active} active</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Contacts</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.contacts.total}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.contacts.subscribed} subscribed</p>
            </div>
            <div className={`rounded-lg p-4 ${engagementData.rate > 2.5 ? 'bg-green-50' : 'bg-gray-50'}`}>
              <p className="text-sm text-gray-500">Engagement Rate</p>
              <p className={`text-2xl font-semibold ${engagementData.rate > 2.5 ? 'text-green-600' : 'text-gray-900'}`}>
                {engagementData.rate > 0 ? `${engagementData.rate.toFixed(2)}%` : '--'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {engagementData.impressions > 0 
                  ? `${formatNumber(engagementData.engagement)} / ${formatNumber(engagementData.impressions)}` 
                  : 'No data yet'}
              </p>
            </div>
          </div>
        )}

        {/* Tabs - UPDATED with AI Insights */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['posts', 'campaigns', 'templates', 'contacts'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
          {/* AI Insights Tab - NEW */}
          <button
            onClick={() => setActiveTab('ai-insights')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'ai-insights'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>🧠</span>
            <span>AI Insights</span>
          </button>
          {/* Integrations Tab */}
          <button
            onClick={() => setActiveTab('integrations')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'integrations'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>⚡</span>
            <span>Integrations</span>
            {integrationSettings.zapier_enabled && (
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      {(activeTab === 'posts' || activeTab === 'campaigns' || activeTab === 'contacts') && (
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-4">
            {activeTab === 'posts' && (
              <select
                value={platformFilter}
                onChange={e => setPlatformFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">All Platforms</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="twitter">Twitter</option>
                <option value="tiktok">TikTok</option>
              </select>
            )}
            {(activeTab === 'posts' || activeTab === 'campaigns') && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
                {activeTab === 'campaigns' && <option value="active">Active</option>}
                {activeTab === 'campaigns' && <option value="completed">Completed</option>}
              </select>
            )}
            {activeTab === 'contacts' && (
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">✕</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <>
            {/* Posts Tab */}
            {activeTab === 'posts' && (
              <div className="space-y-4">
                {posts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No posts found</p>
                    <button onClick={() => setShowCreatePost(true)} className="mt-2 text-sm text-gray-900 underline">
                      Create your first post
                    </button>
                  </div>
                ) : (
                  posts.map(post => (
                    <div key={post.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg ${PLATFORM_COLORS[post.platform] || 'bg-gray-500'}`}>
                            {PLATFORM_ICONS[post.platform] || '📝'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 capitalize">{post.platform}</span>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                post.status === 'published' ? 'bg-green-100 text-green-700' :
                                post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                post.status === 'failed' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>{post.status}</span>
                              {post.publish_method === 'zapier' && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">via Zapier</span>
                              )}
                              {post.ai_generated && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">🤖 AI</span>
                              )}
                              {post.quality_score && (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  post.quality_score >= 80 ? 'bg-green-100 text-green-700' :
                                  post.quality_score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>Q: {post.quality_score}</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 line-clamp-2">{post.content}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                              {post.scheduled_for && <span>Scheduled: {formatDate(post.scheduled_for)}</span>}
                              {post.published_at && <span>Published: {formatDate(post.published_at)}</span>}
                              {post.engagement && (
                                <span>
                                  ❤️ {post.engagement.likes || 0} · 💬 {post.engagement.comments || 0} · 🔄 {post.engagement.shares || 0}
                                </span>
                              )}
                              {post.predicted_engagement && (
                                <span className="text-purple-600">Predicted: {post.predicted_engagement}%</span>
                              )}
                              {post.error_message && <span className="text-red-600">Error: {post.error_message}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {post.status === 'draft' && (
                            <>
                              <button onClick={() => handlePublishPost(post.id)} className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800">
                                Publish
                              </button>
                              {integrationSettings.zapier_enabled && (
                                <button
                                  onClick={() => handlePublishViaZapier(post.id)}
                                  disabled={publishingPostId === post.id}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {publishingPostId === post.id ? '⏳' : '⚡'} Zapier
                                </button>
                              )}
                            </>
                          )}
                          {post.status === 'failed' && integrationSettings.zapier_enabled && (
                            <button
                              onClick={() => handlePublishViaZapier(post.id)}
                              disabled={publishingPostId === post.id}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          )}
                          <button onClick={() => setSelectedPost(post)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                            View
                          </button>
                          <button onClick={() => handleDeletePost(post.id)} className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Campaigns Tab */}
            {activeTab === 'campaigns' && (
              <div className="space-y-4">
                {campaigns.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No campaigns found</p>
                    <button onClick={() => setShowCreateCampaign(true)} className="mt-2 text-sm text-gray-900 underline">
                      Create your first campaign
                    </button>
                  </div>
                ) : (
                  campaigns.map(campaign => (
                    <div key={campaign.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">{campaign.name}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              campaign.status === 'active' ? 'bg-green-100 text-green-700' :
                              campaign.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>{campaign.status}</span>
                            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full capitalize">{campaign.type}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>Sent: {campaign.sent_count}</span>
                            <span>Opens: {campaign.open_count}</span>
                            <span>Clicks: {campaign.click_count}</span>
                            {campaign.sent_count > 0 && (
                              <span>Open rate: {((campaign.open_count / campaign.sent_count) * 100).toFixed(1)}%</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div className="grid grid-cols-2 gap-4">
                {templates.length === 0 ? (
                  <div className="col-span-2 text-center py-12 text-gray-500">
                    <p>No templates found</p>
                  </div>
                ) : (
                  templates.map(template => (
                    <div key={template.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">{template.name}</span>
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">{template.type}</span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{template.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Contacts Tab */}
            {activeTab === 'contacts' && (
              <div className="space-y-2">
                {contacts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No contacts found</p>
                  </div>
                ) : (
                  contacts.map(contact => (
                    <div key={contact.id} className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {contact.first_name || contact.last_name ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500">{contact.email || contact.phone}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {contact.tags?.map(tag => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{tag}</span>
                        ))}
                        <span className={`px-2 py-0.5 text-xs rounded ${contact.is_subscribed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {contact.is_subscribed ? 'Subscribed' : 'Unsubscribed'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* AI Insights Tab - NEW */}
            {activeTab === 'ai-insights' && (
              <div className="space-y-6">
                {/* Sub-navigation */}
                <div className="flex gap-2 border-b border-gray-200 pb-3">
                  {(['overview', 'reports', 'patterns', 'settings'] as const).map(view => (
                    <button
                      key={view}
                      onClick={() => setAiInsightsView(view)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
                        aiInsightsView === view ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                  <button
                    onClick={handleTriggerLearning}
                    disabled={triggeringLearning}
                    className="ml-auto px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50"
                  >
                    {triggeringLearning ? '🔄 Learning...' : '🧠 Trigger Learning'}
                  </button>
                </div>

                {/* AI Overview */}
                {aiInsightsView === 'overview' && (
                  <div className="space-y-6">
                    {/* Today's Report Summary */}
                    {dailyReports[0] && (
                      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-100">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          📊 Today's AI Report ({dailyReports[0].date})
                        </h3>
                        <div className="grid grid-cols-4 gap-4 mb-6">
                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-500">Posts Published</p>
                            <p className="text-xl font-bold text-gray-900">{dailyReports[0].posts_published}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-500">Impressions</p>
                            <p className="text-xl font-bold text-gray-900">{formatNumber(dailyReports[0].total_impressions)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-500">Engagement</p>
                            <p className="text-xl font-bold text-gray-900">{formatNumber(dailyReports[0].total_engagement)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-500">Eng. Rate</p>
                            <p className={`text-xl font-bold ${dailyReports[0].avg_engagement_rate > 2.5 ? 'text-green-600' : 'text-gray-900'}`}>
                              {dailyReports[0].avg_engagement_rate?.toFixed(2)}%
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          {/* Insights */}
                          <div>
                            <h4 className="font-medium text-gray-900 mb-2">💡 Key Insights</h4>
                            <ul className="space-y-2">
                              {dailyReports[0].insights?.slice(0, 4).map((insight, i) => (
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
                              {dailyReports[0].improvement_plan?.slice(0, 4).map((item, i) => (
                                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                  <span className="text-blue-500 mt-0.5">→</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Tomorrow's Strategy */}
                        {dailyReports[0].next_day_strategy && (
                          <div className="mt-4 p-4 bg-white rounded-lg shadow-sm">
                            <h4 className="font-medium text-gray-900 mb-1">🚀 Tomorrow's Strategy</h4>
                            <p className="text-sm text-gray-600">{dailyReports[0].next_day_strategy}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Top Winning Patterns */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">🏆 Top Winning Patterns</h3>
                      <div className="grid grid-cols-3 gap-4">
                        {winningPatterns.slice(0, 6).map(pattern => (
                          <div key={pattern.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                                {pattern.pattern_type}
                              </span>
                              <span className={`text-xs font-medium ${
                                pattern.confidence_score >= 80 ? 'text-green-600' :
                                pattern.confidence_score >= 60 ? 'text-yellow-600' : 'text-gray-500'
                              }`}>
                                {pattern.confidence_score}%
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{pattern.pattern_description}</p>
                            <p className="text-xs text-gray-500 mt-2">
                              Avg: {pattern.avg_engagement_rate}% • {pattern.sample_size} samples
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Reports */}
                {aiInsightsView === 'reports' && (
                  <div className="space-y-4">
                    {dailyReports.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No reports yet</p>
                        <p className="text-sm mt-1">Reports are generated daily at 11 PM</p>
                      </div>
                    ) : (
                      dailyReports.map(report => (
                        <div key={report.date} className="border border-gray-200 rounded-lg p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-semibold text-gray-900">{report.date}</h4>
                            <div className="flex gap-4 text-sm text-gray-500">
                              <span>Posts: {report.posts_published}</span>
                              <span>Imp: {formatNumber(report.total_impressions)}</span>
                              <span className={report.avg_engagement_rate > 2.5 ? 'text-green-600 font-medium' : ''}>
                                Rate: {report.avg_engagement_rate?.toFixed(2)}%
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

                {/* Winning Patterns */}
                {aiInsightsView === 'patterns' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Type</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Platform</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Pattern</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Avg Eng.</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {winningPatterns.map(pattern => (
                          <tr key={pattern.id} className="border-b border-gray-100">
                            <td className="py-3 px-4">
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{pattern.pattern_type}</span>
                            </td>
                            <td className="py-3 px-4 text-sm">{pattern.platform}</td>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Brand Settings */}
                {aiInsightsView === 'settings' && brandGuide && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Brand Style Guide</h3>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                        <input type="text" defaultValue={brandGuide.brand_name} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Voice & Tone</label>
                        <input type="text" defaultValue={brandGuide.voice_tone} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
                        <input type="text" defaultValue={brandGuide.target_audience} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Emoji Usage</label>
                        <select defaultValue={brandGuide.emoji_usage} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                          <option value="heavy">Heavy</option>
                          <option value="moderate">Moderate</option>
                          <option value="minimal">Minimal</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Personality Traits</label>
                        <input type="text" defaultValue={brandGuide.personality_traits?.join(', ')} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="approachable, expert, trustworthy" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Do NOT Use</label>
                        <input type="text" defaultValue={brandGuide.do_not_use?.join(', ')} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="competitor names, clickbait" />
                      </div>
                    </div>
                    <div className="mt-6">
                      <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
                        Save Brand Guide
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                {/* Zapier Integration */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xl">⚡</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Zapier Integration</h3>
                      <p className="text-sm text-gray-500">Automate posting to any platform via Zapier</p>
                    </div>
                    {integrationSettings.zapier_enabled && (
                      <span className="ml-auto px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">Connected</span>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={zapierWebhookInput}
                          onChange={e => setZapierWebhookInput(e.target.value)}
                          placeholder="https://hooks.zapier.com/hooks/catch/..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <button onClick={handleTestZapier} disabled={testingZapier} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50">
                          {testingZapier ? 'Testing...' : 'Test'}
                        </button>
                        <button onClick={handleSaveIntegration} disabled={savingIntegration} className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
                          {savingIntegration ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>

                    {integrationMessage && (
                      <div className={`p-4 rounded-lg ${integrationMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        {integrationMessage.text}
                      </div>
                    )}

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">Data sent to Zapier</h4>
                      <pre className="text-xs text-gray-600 bg-gray-100 p-3 rounded overflow-x-auto">
{`{
  "post_id": "uuid",
  "platform": "instagram",
  "content": "Your post content...",
  "media_urls": ["https://..."],
  "scheduled_for": null,
  "timestamp": "2024-01-15T10:30:00Z"
}`}
                      </pre>
                    </div>

                    <a href="https://zapier.com/app/zaps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 text-sm font-medium">
                      Open Zapier Dashboard →
                    </a>
                  </div>
                </div>

                {/* Future Integrations */}
                <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <p className="text-gray-500 text-sm">More integrations coming soon</p>
                  <p className="text-gray-400 text-xs mt-1">Make.com, n8n, direct API connections</p>
                </div>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (activeTab === 'posts' || activeTab === 'campaigns' || activeTab === 'contacts') && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">
                  Previous
                </button>
                <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Post Modal */}
      {showCreatePost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Create Post</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select value={newPost.platform} onChange={e => setNewPost(prev => ({ ...prev, platform: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="twitter">Twitter</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea value={newPost.content} onChange={e => setNewPost(prev => ({ ...prev, content: e.target.value }))} rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none" placeholder="What would you like to share?" />
                <p className="text-xs text-gray-500 mt-1">{newPost.content.length} characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (optional)</label>
                <input type="datetime-local" value={newPost.scheduledFor} onChange={e => setNewPost(prev => ({ ...prev, scheduledFor: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowCreatePost(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={handleCreatePost} disabled={!newPost.content.trim()} className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
                {newPost.scheduledFor ? 'Schedule' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Content Modal */}
      {showGenerateContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">🤖 AI Content Generator</h3>
              <p className="text-sm text-gray-500 mt-1">Powered by self-learning AI brain</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                <input type="text" value={generateProductId} onChange={e => setGenerateProductId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Enter product ID" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select value={generatePlatform} onChange={e => setGeneratePlatform(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="twitter">Twitter</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
              {generatedContent && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Generated Content</label>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{generatedContent}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => { setShowGenerateContent(false); setGeneratedContent(''); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
              {generatedContent ? (
                <button onClick={handleUseGeneratedContent} className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800">
                  Use This Content
                </button>
              ) : (
                <button onClick={handleAIGenerate} disabled={!generateProductId || generating} className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
                  {generating ? '🧠 Generating...' : '✨ Generate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${PLATFORM_COLORS[selectedPost.platform]}`}>
                  {PLATFORM_ICONS[selectedPost.platform]}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 capitalize">{selectedPost.platform} Post</h3>
                  <p className="text-sm text-gray-500">{selectedPost.ai_generated ? '🤖 AI Generated' : '✍️ Manual'} • {selectedPost.status}</p>
                </div>
              </div>
              <button onClick={() => setSelectedPost(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Content</h4>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedPost.content}</p>
                </div>
              </div>
              {selectedPost.quality_score && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Quality Score</h4>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${selectedPost.quality_score >= 80 ? 'bg-green-500' : selectedPost.quality_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${selectedPost.quality_score}%` }} />
                      </div>
                      <span className="text-lg font-bold">{selectedPost.quality_score}</span>
                    </div>
                  </div>
                  {selectedPost.predicted_engagement && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Predicted Engagement</h4>
                      <p className="text-lg font-bold">{selectedPost.predicted_engagement}%</p>
                    </div>
                  )}
                </div>
              )}
              {selectedPost.engagement && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Performance</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold">{formatNumber(selectedPost.engagement.impressions || 0)}</p>
                      <p className="text-xs text-gray-500">Impressions</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold">{formatNumber(selectedPost.engagement.likes || 0)}</p>
                      <p className="text-xs text-gray-500">Likes</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold">{formatNumber(selectedPost.engagement.comments || 0)}</p>
                      <p className="text-xs text-gray-500">Comments</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold">{formatNumber(selectedPost.engagement.shares || 0)}</p>
                      <p className="text-xs text-gray-500">Shares</p>
                    </div>
                  </div>
                </div>
              )}
              {selectedPost.patterns_used && selectedPost.patterns_used.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Patterns Used</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedPost.patterns_used.map((pattern, i) => (
                      <span key={i} className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded">{pattern}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
