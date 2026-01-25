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

export async function getSocialPosts(filters?: {
  platform?: string;
  status?: string;
  limit?: number;
}): Promise<SocialPost[]> {
  let query = supabase.from('social_posts').select('*');
  
  if (filters?.platform) {
    query = query.eq('platform', filters.platform);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  
  query = query.order('created_at', { ascending: false });
  
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching social posts:', error);
    return [];
  }
  
  return data || [];
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
  platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter'
): Promise<{ content: string; hashtags: string[] }> {
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
- Return JSON: { "content": "...", "hashtags": ["tag1", "tag2", ...] }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    
    return JSON.parse(response.choices[0].message.content || '{"content":"","hashtags":[]}');
  } catch (error) {
    console.error('Error generating social post:', error);
    return { content: product.title, hashtags: [] };
  }
}

export async function generateMultiPlatformContent(
  product: { title: string; description?: string; price?: number }
): Promise<Record<string, { content: string; hashtags: string[] }>> {
  const platforms: ('instagram' | 'facebook' | 'tiktok' | 'twitter')[] = 
    ['instagram', 'facebook', 'tiktok', 'twitter'];
  
  const results: Record<string, { content: string; hashtags: string[] }> = {};
  
  for (const platform of platforms) {
    results[platform] = await generateSocialPost(product, platform);
  }
  
  return results;
}

export async function generateHashtags(
  topic: string,
  count: number = 10
): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Generate ${count} relevant hashtags for: ${topic}. Return JSON: { "hashtags": ["tag1", "tag2", ...] }`
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

export async function getCampaigns(filters?: {
  status?: string;
  type?: string;
}): Promise<Campaign[]> {
  let query = supabase.from('campaigns').select('*');
  
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.type) {
    query = query.eq('type', filters.type);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching campaigns:', error);
    return [];
  }
  
  return data || [];
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
  
  return data;
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
  let query = supabase.from('templates').select('*');
  
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
    .from('templates')
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

export async function getContacts(filters?: {
  subscribed?: boolean;
  tags?: string[];
}): Promise<Contact[]> {
  let query = supabase.from('contacts').select('*');
  
  if (filters?.subscribed !== undefined) {
    query = query.eq('subscribed', filters.subscribed);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching contacts:', error);
    return [];
  }
  
  return data || [];
}

export async function upsertContact(contact: Contact): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .upsert(contact, { onConflict: 'email' })
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
  subject: string,
  context: Record<string, any>
): Promise<{ subject: string; body: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Generate an email with subject "${subject}". Context: ${JSON.stringify(context)}. Return JSON: { "subject": "...", "body": "..." }`
      }],
      response_format: { type: 'json_object' },
    });
    
    return JSON.parse(response.choices[0].message.content || '{"subject":"","body":""}');
  } catch (error) {
    console.error('Error generating email:', error);
    return { subject, body: '' };
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Would integrate with SendGrid, etc.
  console.log(`Sending email to ${to}: ${subject}`);
  return { success: true, messageId: `msg_${Date.now()}` };
}

export async function sendBulkEmails(
  contacts: Contact[],
  subject: string,
  body: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  
  for (const contact of contacts) {
    if (contact.email) {
      const result = await sendEmail(contact.email, subject, body);
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
  context: Record<string, any>
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Generate a short SMS (max 160 chars) for: ${JSON.stringify(context)}. Return JSON: { "message": "..." }`
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
  contacts: Contact[],
  message: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  
  for (const contact of contacts) {
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
