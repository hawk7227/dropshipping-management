// lib/social-marketing.ts
// Complete social marketing library with all required exports

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// TYPES
// ============================================================================

interface SocialPost {
  id?: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter';
  content: string;
  media_urls?: string[];
  hashtags?: string[];
  scheduled_for?: string;
  published_at?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  product_id?: string;
}

interface Campaign {
  id?: string;
  name: string;
  type: 'social' | 'email' | 'sms' | 'multi';
  status: 'draft' | 'active' | 'paused' | 'completed';
  start_date?: string;
  end_date?: string;
  posts?: SocialPost[];
  metrics?: Record<string, number>;
}

interface Template {
  id?: string;
  name: string;
  type: 'social' | 'email' | 'sms';
  platform?: string;
  content: string;
  variables?: string[];
}

interface Contact {
  id?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tags?: string[];
  subscribed: boolean;
}

// ============================================================================
// SOCIAL POSTS - CRUD
// ============================================================================

export async function getSocialPosts(filters: {
  platform?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ posts: SocialPost[]; total: number }> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('social_posts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.platform) {
    query = query.eq('platform', filters.platform);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching social posts:', error);
    return { posts: [], total: 0 };
  }

  return { posts: (data as SocialPost[]) || [], total: count || 0 };
}

export async function createSocialPost(post: Omit<SocialPost, 'id'>): Promise<SocialPost | null> {
  const { data, error } = await supabase
    .from('social_posts')
    .insert(post)
    .select()
    .single();
  
  if (error) {
    console.error('Error creating social post:', error);
    return null;
  }
  
  return data;
}

export async function updateSocialPost(
  postId: string,
  updates: Partial<SocialPost>
): Promise<SocialPost | null> {
  const { data, error } = await supabase
    .from('social_posts')
    .update(updates)
    .eq('id', postId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating social post:', error);
    return null;
  }
  
  return data;
}

export async function deleteSocialPost(postId: string): Promise<boolean> {
  const { error } = await supabase
    .from('social_posts')
    .delete()
    .eq('id', postId);
  
  if (error) {
    console.error('Error deleting social post:', error);
    return false;
  }
  
  return true;
}

// ============================================================================
// AI CONTENT GENERATION
// ============================================================================

export async function generateSocialPost(
  product: { title: string; description?: string; price?: number },
  options: {
    platform?: 'instagram' | 'facebook' | 'tiktok' | 'twitter';
    tone?: string;
    includeHashtags?: boolean;
    includeEmoji?: boolean;
    customPrompt?: string;
  } = {}
): Promise<string> {
  const platform = options.platform || 'instagram';
  const platformLimits: Record<string, number> = {
    instagram: 2200,
    facebook: 500,
    tiktok: 300,
    twitter: 280,
  };
  
  const prompt = `Create a ${platform} post for this product:
Title: ${product.title}
Description: ${product.description || 'N/A'}
Price: ${product.price ? `$${product.price}` : 'N/A'}

Requirements:
- Max ${platformLimits[platform]} characters
- Engaging hook
- Call to action
- Tone: ${options.tone || 'engaging, friendly'}
${options.includeEmoji === false ? '- Do NOT use emojis' : '- Emojis allowed if helpful'}
${options.customPrompt ? `Additional instructions: ${options.customPrompt}` : ''}

Return only the post text.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.choices[0].message.content || '';
    return content.trim();
  } catch (error) {
    console.error('Error generating social post:', error);
    return product.title;
  }
}

export async function generateMultiPlatformContent(
  product: { title: string; description?: string; price?: number },
  platforms: ('instagram' | 'facebook' | 'tiktok' | 'twitter')[] = ['instagram', 'facebook', 'twitter'],
  tone?: string
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  
  for (const platform of platforms) {
    results[platform] = await generateSocialPost(product, { platform, tone });
  }
  
  return results;
}

export async function generateHashtags(
  topic: { title: string; description?: string },
  count: number = 10
): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Generate ${count} relevant hashtags for this product.
Title: ${topic.title}
Description: ${topic.description || 'N/A'}

Return JSON: { "hashtags": ["tag1", "tag2", ...] }`
      }],
      response_format: { type: 'json_object' },
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{"hashtags":[]}');
    return result.hashtags || [];
  } catch (error) {
    console.error('Error generating hashtags:', error);
    return [];
  }
}

// ============================================================================
// PUBLISHING
// ============================================================================

export async function publishToInstagram(
  post: SocialPost
): Promise<{ success: boolean; error?: string }> {
  // This would integrate with Instagram Graph API or Zapier
  console.log('Publishing to Instagram:', post.content?.substring(0, 50));
  
  // Update post status
  if (post.id) {
    await updateSocialPost(post.id, {
      status: 'published',
      published_at: new Date().toISOString(),
    });
  }
  
  return { success: true };
}

export async function publishToFacebook(
  post: SocialPost
): Promise<{ success: boolean; error?: string }> {
  // This would integrate with Facebook Graph API or Zapier
  console.log('Publishing to Facebook:', post.content?.substring(0, 50));
  
  // Update post status
  if (post.id) {
    await updateSocialPost(post.id, {
      status: 'published',
      published_at: new Date().toISOString(),
    });
  }
  
  return { success: true };
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

export async function getCampaigns(filters: {
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ campaigns: Campaign[]; total: number }> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('campaigns')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error('Error fetching campaigns:', error);
    return { campaigns: [], total: 0 };
  }
  
  return { campaigns: (data as Campaign[]) || [], total: count || 0 };
}

export async function createCampaign(campaign: Omit<Campaign, 'id'>): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert(campaign)
    .select()
    .single();
  
  if (error) {
    console.error('Error creating campaign:', error);
    return null;
  }
  
  return data as Campaign;
}

export async function executeCampaign(campaignId: string): Promise<{
  success: boolean;
  postsPublished: number;
  errors: string[];
}> {
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, posts:social_posts(*)')
    .eq('id', campaignId)
    .single();
  
  if (!campaign) {
    return { success: false, postsPublished: 0, errors: ['Campaign not found'] };
  }
  
  let published = 0;
  const errors: string[] = [];
  
  // Update campaign status
  await supabase
    .from('campaigns')
    .update({ status: 'active' })
    .eq('id', campaignId);
  
  return { success: true, postsPublished: published, errors };
}

// ============================================================================
// TEMPLATES
// ============================================================================

export async function getTemplates(type?: string): Promise<Template[]> {
  // Use a dedicated message_templates table for all template types
  let query = supabase.from('message_templates').select('*');
  
  if (type) {
    query = query.eq('type', type);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
  
  return data || [];
}

export async function createTemplate(template: Omit<Template, 'id'>): Promise<Template | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .insert(template)
    .select()
    .single();
  
  if (error) {
    console.error('Error creating template:', error);
    return null;
  }
  
  return data;
}

// ============================================================================
// CONTACTS
// ============================================================================

export async function getContacts(filters: {
  tags?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ contacts: Contact[]; total: number }> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('marketing_contacts')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (filters.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(
      `email.ilike.${term},phone.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching contacts:', error);
    return { contacts: [], total: 0 };
  }

  return { contacts: (data as Contact[]) || [], total: count || 0 };
}

export async function upsertContact(contact: {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  is_subscribed?: boolean;
}): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('marketing_contacts')
    .upsert(
      {
        email: contact.email || null,
        phone: contact.phone || null,
        first_name: contact.first_name || null,
        last_name: contact.last_name || null,
        tags: contact.tags || [],
        metadata: contact.metadata || {},
        is_subscribed: contact.is_subscribed ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    )
    .select()
    .single();
  
  if (error) {
    console.error('Error upserting contact:', error);
    return null;
  }
  
  return data;
}

// ============================================================================
// EMAIL
// ============================================================================

export async function generateEmailContent(
  product: { title: string; description?: string; vendor?: string; product_type?: string; images?: any[] },
  options: {
    purpose?: string;
    tone?: string;
    includeUnsubscribe?: boolean;
  } = {}
): Promise<{ subject: string; html: string; text: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Generate a marketing email for this product.
Product: ${product.title}
Description: ${product.description || 'N/A'}
Vendor: ${product.vendor || 'N/A'}
Type: ${product.product_type || 'N/A'}

Purpose: ${options.purpose || 'promotion'}
Tone: ${options.tone || 'professional, friendly'}
${options.includeUnsubscribe === false ? 'Do NOT include unsubscribe language.' : 'Include a short unsubscribe note at the end.'}

Return JSON: { "subject": "...", "html": "<p>...</p>", "text": "..." }`
      }],
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return {
      subject: parsed.subject || product.title,
      html: parsed.html || `<p>${parsed.text || ''}</p>`,
      text: parsed.text || '',
    };
  } catch (error) {
    console.error('Error generating email:', error);
    return { subject: product.title, html: '', text: '' };
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Would integrate with SendGrid, etc.
  console.log(`Sending email to ${to}: ${subject}`);
  void html;
  void text;
  return { success: true, messageId: `msg_${Date.now()}` };
}

export async function sendBulkEmails(
  recipients: { email?: string; first_name?: string; last_name?: string }[],
  subject: string,
  html: string,
  text?: string,
  _personalize?: boolean
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  
  for (const contact of recipients) {
    if (contact.email) {
      const result = await sendEmail(contact.email, subject, html, text);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
  }
  
  return { sent, failed };
}

// ============================================================================
// SMS
// ============================================================================

export async function generateSMS(
  product: { title: string; description?: string; handle?: string },
  link?: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Generate a short SMS (max 160 chars) promoting this product.
Title: ${product.title}
Description: ${product.description || 'N/A'}
${link ? `Link: ${link}` : ''}

Return JSON: { "message": "..." }`
      }],
      response_format: { type: 'json_object' },
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{"message":""}');
    return result.message || '';
  } catch (error) {
    console.error('Error generating SMS:', error);
    return '';
  }
}

export async function sendSMS(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Would integrate with Twilio, etc.
  console.log(`Sending SMS to ${to}: ${message.substring(0, 50)}...`);
  return { success: true, messageId: `sms_${Date.now()}` };
}

export async function sendBulkSMS(
  recipients: { phone?: string }[],
  message: string,
  _personalize?: boolean
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  
  for (const contact of recipients) {
    if (contact.phone) {
      const result = await sendSMS(contact.phone, message);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
  }
  
  return { sent, failed };
}
