'use client';

// components/social/SocialMarketingPanel.tsx
// Full social media and marketing management panel

import React, { useState, useEffect, useCallback } from 'react';

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  media_urls?: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduled_for?: string;
  published_at?: string;
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
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
}

type TabType = 'posts' | 'campaigns' | 'templates' | 'contacts' | 'generate';

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

export default function SocialMarketingPanel() {
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
        setTotalPages(data.pagination.totalPages);
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
        setTotalPages(data.pagination.totalPages);
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
        setTotalPages(data.pagination.totalPages);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(1);
    if (activeTab === 'posts') fetchPosts();
    else if (activeTab === 'campaigns') fetchCampaigns();
    else if (activeTab === 'templates') fetchTemplates();
    else if (activeTab === 'contacts') fetchContacts();
  }, [activeTab, fetchPosts, fetchCampaigns, fetchTemplates, fetchContacts]);

  useEffect(() => {
    if (activeTab === 'posts') fetchPosts();
    else if (activeTab === 'campaigns') fetchCampaigns();
    else if (activeTab === 'contacts') fetchContacts();
  }, [page, platformFilter, statusFilter, searchQuery, activeTab, fetchPosts, fetchCampaigns, fetchContacts]);

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

  const handleGenerateContent = async () => {
    if (!generateProductId) return;

    setGenerating(true);
    setGeneratedContent('');

    try {
      const res = await fetch('/api/social?action=generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: generateProductId,
          platform: generatePlatform,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setGeneratedContent(data.data.content);
      } else {
        setError(data.error);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

        {/* Stats */}
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
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Engagement Rate</p>
              <p className="text-2xl font-semibold text-gray-900">--</p>
              <p className="text-xs text-gray-500 mt-1">Coming soon</p>
            </div>
          </div>
        )}

        {/* Tabs */}
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
                    <button
                      onClick={() => setShowCreatePost(true)}
                      className="mt-2 text-sm text-gray-900 underline"
                    >
                      Create your first post
                    </button>
                  </div>
                ) : (
                  posts.map(post => (
                    <div
                      key={post.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg ${
                              PLATFORM_COLORS[post.platform] || 'bg-gray-500'
                            }`}
                          >
                            {PLATFORM_ICONS[post.platform] || '📝'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900 capitalize">
                                {post.platform}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  post.status === 'published'
                                    ? 'bg-green-100 text-green-700'
                                    : post.status === 'scheduled'
                                    ? 'bg-blue-100 text-blue-700'
                                    : post.status === 'failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {post.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 line-clamp-2">{post.content}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              {post.scheduled_for && (
                                <span>Scheduled: {formatDate(post.scheduled_for)}</span>
                              )}
                              {post.published_at && (
                                <span>Published: {formatDate(post.published_at)}</span>
                              )}
                              {post.engagement && (
                                <span>
                                  {post.engagement.likes || 0} likes · {post.engagement.comments || 0} comments
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {post.status === 'draft' && (
                            <button
                              onClick={() => handlePublishPost(post.id)}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
                            >
                              Publish
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedPost(post)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                          >
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
                    <button
                      onClick={() => setShowCreateCampaign(true)}
                      className="mt-2 text-sm text-gray-900 underline"
                    >
                      Create your first campaign
                    </button>
                  </div>
                ) : (
                  campaigns.map(campaign => (
                    <div
                      key={campaign.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                campaign.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : campaign.status === 'completed'
                                  ? 'bg-blue-100 text-blue-700'
                                  : campaign.status === 'paused'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {campaign.status}
                            </span>
                            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full uppercase">
                              {campaign.type}
                            </span>
                          </div>
                          {campaign.subject && (
                            <p className="text-sm text-gray-600 mb-2">{campaign.subject}</p>
                          )}
                          <div className="flex items-center gap-6 text-sm text-gray-500">
                            <span>{campaign.sent_count} sent</span>
                            <span>{campaign.open_count} opened</span>
                            <span>{campaign.click_count} clicked</span>
                            {campaign.sent_count > 0 && (
                              <span className="text-green-600">
                                {((campaign.open_count / campaign.sent_count) * 100).toFixed(1)}% open rate
                              </span>
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
                    <div
                      key={template.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">{template.name}</h3>
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full uppercase">
                          {template.type}
                        </span>
                      </div>
                      {template.subject && (
                        <p className="text-sm text-gray-600 mb-2">{template.subject}</p>
                      )}
                      <p className="text-xs text-gray-500 line-clamp-2">{template.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Contacts Tab */}
            {activeTab === 'contacts' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Contact</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Email</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Phone</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tags</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-gray-500">
                          No contacts found
                        </td>
                      </tr>
                    ) : (
                      contacts.map(contact => (
                        <tr key={contact.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className="font-medium text-gray-900">
                              {contact.first_name || contact.last_name
                                ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
                                : 'Unknown'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">{contact.email || '-'}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">{contact.phone || '-'}</td>
                          <td className="py-3 px-4">
                            <div className="flex gap-1 flex-wrap">
                              {contact.tags.slice(0, 3).map(tag => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                              {contact.tags.length > 3 && (
                                <span className="text-xs text-gray-500">+{contact.tags.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                contact.is_subscribed
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {contact.is_subscribed ? 'Subscribed' : 'Unsubscribed'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (activeTab === 'posts' || activeTab === 'campaigns' || activeTab === 'contacts') && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
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
                <select
                  value={newPost.platform}
                  onChange={e => setNewPost(prev => ({ ...prev, platform: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="twitter">Twitter</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={newPost.content}
                  onChange={e => setNewPost(prev => ({ ...prev, content: e.target.value }))}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  placeholder="What would you like to share?"
                />
                <p className="text-xs text-gray-500 mt-1">{newPost.content.length} characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (optional)</label>
                <input
                  type="datetime-local"
                  value={newPost.scheduledFor}
                  onChange={e => setNewPost(prev => ({ ...prev, scheduledFor: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowCreatePost(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePost}
                disabled={!newPost.content.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
              <h3 className="text-lg font-semibold text-gray-900">AI Content Generator</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                <input
                  type="text"
                  value={generateProductId}
                  onChange={e => setGenerateProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Enter product ID"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select
                  value={generatePlatform}
                  onChange={e => setGeneratePlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
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
              <button
                onClick={() => {
                  setShowGenerateContent(false);
                  setGeneratedContent('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              {generatedContent ? (
                <button
                  onClick={handleUseGeneratedContent}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
                >
                  Use This Content
                </button>
              ) : (
                <button
                  onClick={handleGenerateContent}
                  disabled={!generateProductId || generating}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? 'Generating...' : 'Generate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
