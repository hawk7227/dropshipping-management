// lib/social-marketing.ts
// Social & Marketing: Post generation, scheduling, platform APIs, email/SMS

import { createClient } from '@supabase/supabase-js';
import type { SocialPost, SocialAccount, Campaign, EmailCampaign, ContentCalendarItem } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';

// Platform character limits
const PLATFORM_LIMITS: Record<string, number> = {
  twitter: 280,
  instagram: 2200,
  facebook: 63206,
  tiktok: 2200,
  linkedin: 3000,
};

// =====================
// AI CONTENT GENERATION
// =====================

async function callOpenAI(prompt: string, maxTokens: number = 500): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert social media marketer. Create engaging, conversion-focused content. Be concise and authentic.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
  
  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// Generate social media post content
export async function generatePostContent(
  platform: string,
  options: {
    product?: { title: string; description?: string; price?: number };
    topic?: string;
    tone?: 'professional' | 'casual' | 'humorous' | 'urgent';
    includeEmojis?: boolean;
    includeHashtags?: boolean;
  }
): Promise<{ content: string; hashtags: string[] }> {
  const maxLength = PLATFORM_LIMITS[platform] || 2200;
  const { product, topic, tone = 'casual', includeEmojis = true, includeHashtags = true } = options;

  let prompt = `Create a ${platform} post`;
  
  if (product) {
    prompt += ` promoting: "${product.title}"`;
    if (product.description) prompt += `\nDescription: ${product.description}`;
    if (product.price) prompt += `\nPrice: $${product.price}`;
  } else if (topic) {
    prompt += ` about: "${topic}"`;
  }

  prompt += `\n\nRequirements:
- Tone: ${tone}
- Maximum ${maxLength} characters
- ${includeEmojis ? 'Include relevant emojis' : 'No emojis'}
- ${includeHashtags ? 'Include 3-5 relevant hashtags at the end' : 'No hashtags'}

Return ONLY the post text.`;

  const content = await callOpenAI(prompt, 400);
  const hashtags = content.match(/#\w+/g) || [];

  return { content: content.trim(), hashtags };
}

// Generate multiple platform variants
export async function generateMultiPlatformContent(options: {
  product?: { title: string; description?: string; price?: number };
  topic?: string;
}): Promise<Record<string, { content: string; hashtags: string[] }>> {
  const platforms = ['instagram', 'tiktok', 'facebook', 'twitter'];
  const results: Record<string, { content: string; hashtags: string[] }> = {};

  for (const platform of platforms) {
    try {
      results[platform] = await generatePostContent(platform, options);
    } catch (error) {
      console.error(`Failed to generate ${platform} content:`, error);
      results[platform] = { content: '', hashtags: [] };
    }
  }

  return results;
}

// =====================
// POST MANAGEMENT
// =====================

// Create a new post
export async function createPost(post: Omit<SocialPost, 'id' | 'created_at' | 'updated_at'>): Promise<SocialPost> {
  const { data, error } = await supabase
    .from('social_posts')
    .insert(post)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update a post
export async function updatePost(postId: string, updates: Partial<SocialPost>): Promise<SocialPost> {
  const { data, error } = await supabase
    .from('social_posts')
    .update(updates)
    .eq('id', postId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Schedule a post
export async function schedulePost(postId: string, scheduledAt: Date): Promise<SocialPost> {
  return updatePost(postId, {
    scheduled_at: scheduledAt.toISOString(),
    status: 'scheduled',
  });
}

// Get posts
export async function getPosts(options: {
  platform?: string;
  status?: string;
  limit?: number;
}): Promise<SocialPost[]> {
  let query = supabase
    .from('social_posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.platform) query = query.eq('platform', options.platform);
  if (options.status) query = query.eq('status', options.status);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Get scheduled posts due for publishing
export async function getDueScheduledPosts(): Promise<SocialPost[]> {
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString());

  if (error) throw error;
  return data || [];
}

// =====================
// PLATFORM PUBLISHING
// =====================

// Publish to Instagram/Facebook (Meta)
async function publishToMeta(post: SocialPost, accountId: string): Promise<string> {
  if (!META_ACCESS_TOKEN) throw new Error('Meta access token not configured');

  const endpoint = post.platform === 'instagram'
    ? `https://graph.facebook.com/v18.0/${accountId}/media`
    : `https://graph.facebook.com/v18.0/${accountId}/feed`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: META_ACCESS_TOKEN,
      message: post.content,
      ...(post.media_urls?.[0] && { image_url: post.media_urls[0] }),
    }),
  });

  if (!response.ok) throw new Error(`Meta API error: ${response.status}`);
  
  const data = await response.json();
  return data.id;
}

// Publish to TikTok
async function publishToTikTok(post: SocialPost): Promise<string> {
  if (!TIKTOK_ACCESS_TOKEN) throw new Error('TikTok access token not configured');

  // TikTok requires video upload - simplified placeholder
  console.log('[TikTok] Would publish:', post.content);
  return 'tiktok_placeholder_id';
}

// Publish a scheduled post
export async function publishPost(postId: string): Promise<SocialPost> {
  const { data: post, error } = await supabase
    .from('social_posts')
    .select('*, social_accounts(*)')
    .eq('id', postId)
    .single();

  if (error || !post) throw new Error('Post not found');

  try {
    let platformPostId: string;

    switch (post.platform) {
      case 'instagram':
      case 'facebook':
        platformPostId = await publishToMeta(post, post.social_accounts?.account_id);
        break;
      case 'tiktok':
        platformPostId = await publishToTikTok(post);
        break;
      default:
        throw new Error(`Unsupported platform: ${post.platform}`);
    }

    return updatePost(postId, {
      status: 'published',
      published_at: new Date().toISOString(),
      platform_post_id: platformPostId,
    });
  } catch (error) {
    await updatePost(postId, { status: 'failed' });
    throw error;
  }
}

// =====================
// SOCIAL ACCOUNTS
// =====================

// Connect a social account
export async function connectSocialAccount(account: Omit<SocialAccount, 'id' | 'connected_at'>): Promise<SocialAccount> {
  const { data, error } = await supabase
    .from('social_accounts')
    .upsert(account, { onConflict: 'platform,account_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get connected accounts
export async function getSocialAccounts(platform?: string): Promise<SocialAccount[]> {
  let query = supabase
    .from('social_accounts')
    .select('*')
    .eq('is_active', true);

  if (platform) query = query.eq('platform', platform);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =====================
// CAMPAIGNS
// =====================

// Create campaign
export async function createCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert(campaign)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get campaigns
export async function getCampaigns(options: { status?: string; type?: string }): Promise<Campaign[]> {
  let query = supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.status) query = query.eq('status', options.status);
  if (options.type) query = query.eq('type', options.type);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =====================
// EMAIL MARKETING
// =====================

// Send email via SendGrid
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  if (!SENDGRID_API_KEY) throw new Error('SendGrid API key not configured');

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: recipients.map(email => ({ email })) }],
      from: {
        email: options.fromEmail || 'noreply@example.com',
        name: options.fromName || 'Store',
      },
      subject: options.subject,
      content: [
        { type: 'text/plain', value: options.text || options.html.replace(/<[^>]*>/g, '') },
        { type: 'text/html', value: options.html },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid error: ${error}`);
  }

  return { success: true, messageId: response.headers.get('x-message-id') || undefined };
}

// Create email campaign
export async function createEmailCampaign(
  email: Omit<EmailCampaign, 'id' | 'created_at'>
): Promise<EmailCampaign> {
  const { data, error } = await supabase
    .from('email_campaigns')
    .insert(email)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================
// SMS MARKETING
// =====================

// Send SMS via Twilio
export async function sendSMS(options: {
  to: string;
  message: string;
  mediaUrl?: string;
}): Promise<{ success: boolean; sid?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured');
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) throw new Error('Twilio phone number not configured');

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
      },
      body: new URLSearchParams({
        To: options.to,
        From: fromNumber,
        Body: options.message,
        ...(options.mediaUrl && { MediaUrl: options.mediaUrl }),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twilio error: ${error}`);
  }

  const data = await response.json();
  return { success: true, sid: data.sid };
}

// =====================
// CONTENT CALENDAR
// =====================

// Add to content calendar
export async function addToCalendar(
  item: Omit<ContentCalendarItem, 'id' | 'created_at'>
): Promise<ContentCalendarItem> {
  const { data, error } = await supabase
    .from('content_calendar')
    .insert(item)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get calendar items
export async function getCalendarItems(options: {
  startDate: string;
  endDate: string;
  platform?: string;
}): Promise<ContentCalendarItem[]> {
  let query = supabase
    .from('content_calendar')
    .select('*')
    .gte('date', options.startDate)
    .lte('date', options.endDate)
    .order('date');

  if (options.platform) query = query.eq('platform', options.platform);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Generate content calendar suggestions
export async function generateCalendarSuggestions(options: {
  topic: string;
  days: number;
  platforms: string[];
}): Promise<Array<{ day: number; platform: string; contentType: string; idea: string }>> {
  const prompt = `Create a ${options.days}-day content calendar for: "${options.topic}"

Platforms: ${options.platforms.join(', ')}

For each day provide:
- Day number (1-${options.days})
- Platform
- Content type (post, story, reel, thread)
- Content idea (1 sentence)

Format: DAY|PLATFORM|TYPE|IDEA
Return ${options.days} entries, one per line.`;

  const response = await callOpenAI(prompt, 500);

  return response.split('\n')
    .filter(line => line.includes('|'))
    .map(line => {
      const [day, platform, contentType, idea] = line.split('|').map(s => s.trim());
      return {
        day: parseInt(day) || 1,
        platform: platform || 'instagram',
        contentType: contentType || 'post',
        idea: idea || '',
      };
    });
}

// =====================
// UTILITIES
// =====================

// Generate hashtags for a topic
export async function generateHashtags(topic: string, count: number = 10): Promise<string[]> {
  const prompt = `Generate ${count} hashtags for Instagram about: "${topic}"
Mix popular and niche hashtags. Format: #hashtag (one per line). Return only the hashtags.`;

  const response = await callOpenAI(prompt, 150);
  
  return response
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('#'))
    .slice(0, count);
}

// Check which services are configured
export function getConfiguredServices(): {
  openai: boolean;
  meta: boolean;
  tiktok: boolean;
  twilio: boolean;
  sendgrid: boolean;
} {
  return {
    openai: !!OPENAI_API_KEY,
    meta: !!META_ACCESS_TOKEN,
    tiktok: !!TIKTOK_ACCESS_TOKEN,
    twilio: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN),
    sendgrid: !!SENDGRID_API_KEY,
  };
}
